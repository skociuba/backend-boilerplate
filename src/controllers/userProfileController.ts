import path from "path";
import { Request, Response } from "express";
import prisma from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { ProfileInput } from "../lib/profileValidation";
import { deleteUploadedFile } from "../lib/uploads";

// Wspólne dla upsert/uploadAvatar/uploadDocument/deleteProfile/downloadDocument —
// profil to dane prywatne, więc każda operacja na nim zaczyna się od tego
// samego sprawdzenia własności (userId z URL === req.currentUserId).
const requireOwnProfile = (req: Request, message: string): number => {
  const userId = parseInt(req.params.id);
  if (userId !== req.currentUserId) {
    throw new ForbiddenError(message);
  }
  return userId;
};

// Kształt odpowiedzi GET/PUT: name z users + pola profilu (null, jeśli
// wiersza w user_profiles jeszcze nie ma). Front dostaje zawsze ten sam
// obiekt — nie musi rozróżniać "brak profilu" (404) od "pusty profil".
const toProfileResponse = (
  userId: number,
  name: string,
  profile: {
    date_of_birth: Date | null;
    phone: string | null;
    avatar_path: string | null;
    document_original_name: string | null;
  } | null
) => ({
  user_id: userId,
  name,
  date_of_birth: profile?.date_of_birth ? profile.date_of_birth.toISOString().slice(0, 10) : null,
  phone: profile?.phone ?? null,
  avatar_path: profile?.avatar_path ?? null,
  // Sama nazwa, nie ścieżka na dysku — dokument pobiera się przez chroniony
  // endpoint downloadDocument, front nie ma po co znać document_path.
  document_original_name: profile?.document_original_name ?? null,
});

class UserProfileController {
  // GET /users/:id/profile — profil to dane prywatne (telefon, data
  // urodzenia, dokument), więc w odróżnieniu od postów NIE jest publiczny:
  // tylko właściciel go czyta
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz przeglądać tylko własny profil.");

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { name: true, user_profiles: true },
    });
    if (!user) throw new NotFoundError("User not found");

    res.status(200).json(toProfileResponse(userId, user.name, user.user_profiles));
  });

  // PUT /users/:id/profile { name, date_of_birth?, phone? } — body już
  // przeszło profileSchema (validateBody w routes). Imię i nazwisko jest w
  // users, reszta w user_profiles — $transaction, żeby nie zapisać jednego
  // bez drugiego. Upsert, bo relacja jest 1:1: "zapisz profil" = stwórz albo
  // nadpisz, bez ręcznego ON CONFLICT.
  public upsert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz edytować tylko własny profil.");

    const { name, date_of_birth, phone } = req.body as ProfileInput;
    const profileData = {
      date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
      phone: phone ?? null,
    };

    const [user, profile] = await prisma.$transaction([
      prisma.users.update({ where: { id: userId }, data: { name }, select: { name: true } }),
      prisma.user_profiles.upsert({
        where: { user_id: userId },
        update: profileData,
        create: { user_id: userId, ...profileData },
      }),
    ]);

    res.status(200).json(toProfileResponse(userId, user.name, profile));
  });

  // PUT /users/:id/profile/avatar — multipart/form-data, pole "avatar"
  // (routes: uploadAvatar middleware z lib/uploads.ts parsuje go PRZED tym,
  // jak tu wchodzimy — req.file jest już zapisany na dysku). Avatar jest
  // PUBLICZNY (zdjęcie, nie dokument prywatny) — ścieżka w DB, a plik
  // serwowany statycznie (patrz index.ts: /uploads/avatars).
  public uploadAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz zmienić tylko własny avatar.");

    if (!req.file) throw new BadRequestError("Brak pliku (pole 'avatar')");

    const existing = await prisma.user_profiles.findUnique({
      where: { user_id: userId },
      select: { avatar_path: true },
    });

    const avatar_path = `/uploads/avatars/${req.file.filename}`;
    // upsert, nie update: wszystkie pola profilu są opcjonalne, więc avatar
    // można wgrać, zanim ktokolwiek zapisze formularz profilu
    const profile = await prisma.user_profiles.upsert({
      where: { user_id: userId },
      update: { avatar_path },
      create: { user_id: userId, avatar_path },
    });

    // Stary plik kasujemy PO udanym zapisie — gdyby zapis się nie udał,
    // stary avatar musi nadal istnieć, bo baza wciąż na niego wskazuje
    if (existing?.avatar_path) {
      deleteUploadedFile(path.join(process.cwd(), existing.avatar_path));
    }

    res.status(200).json(profile);
  });

  // PUT /users/:id/profile/document — jw., pole "document". Dokument jest
  // PRYWATNY (może być np. skan dowodu) — w odróżnieniu od avatara NIE ma
  // statycznego URL-a, tylko chroniony endpoint downloadDocument niżej.
  public uploadDocument = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz zmienić tylko własny dokument.");

    if (!req.file) throw new BadRequestError("Brak pliku (pole 'document')");

    const existing = await prisma.user_profiles.findUnique({
      where: { user_id: userId },
      select: { document_path: true },
    });

    const document_path = `/uploads/documents/${req.file.filename}`;
    const documentData = { document_path, document_original_name: req.file.originalname };
    const profile = await prisma.user_profiles.upsert({
      where: { user_id: userId },
      update: documentData,
      create: { user_id: userId, ...documentData },
    });

    if (existing?.document_path) {
      deleteUploadedFile(path.join(process.cwd(), existing.document_path));
    }

    res.status(200).json(profile);
  });

  // GET /users/:id/profile/document — jedyne miejsce, które faktycznie
  // CZYTA zawartość dokumentu. requireOwnProfile tutaj jest krytyczne:
  // bez tego sprawdzenia ZALOGOWANY user mógłby pobrać CUDZY dokument,
  // znając tylko jego :id w URL-u (document_path na dysku jest losowym
  // UUID, ale endpoint i tak musi sam decydować, kto ma prawo go poprosić —
  // "trudne do odgadnięcia" to nie to samo co "chronione").
  public downloadDocument = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz pobrać tylko własny dokument.");

    const profile = await prisma.user_profiles.findUnique({
      where: { user_id: userId },
      select: { document_path: true, document_original_name: true },
    });

    if (!profile?.document_path) throw new NotFoundError("Document not found");

    res.download(
      path.join(process.cwd(), profile.document_path),
      profile.document_original_name ?? "document"
    );
  });

  // DELETE /users/:id/profile
  public deleteProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz usunąć tylko własny profil.");

    const profile = await prisma.user_profiles.delete({ where: { user_id: userId } });

    // Wiersz w bazie i pliki na dysku to DWA osobne zasoby — usunięcie
    // jednego nie usuwa drugiego automatycznie, trzeba obsłużyć ręcznie.
    if (profile.avatar_path) deleteUploadedFile(path.join(process.cwd(), profile.avatar_path));
    if (profile.document_path) {
      deleteUploadedFile(path.join(process.cwd(), profile.document_path));
    }

    res.status(200).json({ message: "Profile deleted successfully" });
  });
}

export default UserProfileController;
