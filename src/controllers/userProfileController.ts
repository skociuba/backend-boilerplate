import path from "path";
import { Request, Response } from "express";
import prisma from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { deleteUploadedFile } from "../lib/uploads";
import { Prisma } from "../generated/prisma/client";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";

// 23514 (check_violation na PESEL) nie jest "znanym" błędem dla Prismy —
// CHECK nie jest częścią schema.prisma (patrz komentarz przy modelu
// user_profiles), więc prawdziwy kod Postgresa trzeba wyciągnąć z
// error.meta.driverAdapterError.cause.code — sprawdzone naocznie
// (console.log całego error), nie zgadnięte z dokumentacji.
const pgErrorCode = (error: unknown): string | undefined => {
  const err = error as { meta?: { driverAdapterError?: { cause?: { code?: string } } } };
  return err.meta?.driverAdapterError?.cause?.code;
};

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

class UserProfileController {
  // GET /users/:id/profile — profil to dane prywatne (PESEL, telefon), więc
  // w odróżnieniu od postów NIE jest publiczny: tylko właściciel go czyta
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz przeglądać tylko własny profil.");

    const profile = await prisma.user_profiles.findUnique({ where: { user_id: userId } });
    if (!profile) throw new NotFoundError("Profile not found");

    res.status(200).json(profile);
  });

  // PUT /users/:id/profile — upsert: relacja jest 1:1, więc "zapisz profil"
  // znaczy "stwórz, albo nadpisz jeśli już istnieje" w jednym zapytaniu.
  // Prisma ma to jako natywną operację .upsert() — nie trzeba ręcznego
  // ON CONFLICT.
  public upsert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz edytować tylko własny profil.");

    const { pesel, date_of_birth, phone } = req.body;

    try {
      const profile = await prisma.user_profiles.upsert({
        where: { user_id: userId },
        update: { pesel, date_of_birth: new Date(date_of_birth), phone },
        create: { user_id: userId, pesel, date_of_birth: new Date(date_of_birth), phone },
      });
      res.status(200).json(profile);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("PESEL already used by another user");
      }
      if (isForeignKeyViolation(error)) {
        throw new NotFoundError("User not found");
      }

      const pgCode = pgErrorCode(error);
      if (pgCode === "23514") {
        throw new BadRequestError("PESEL must be exactly 11 digits");
      }
      if (pgCode === "22007" || pgCode === "22008") {
        throw new BadRequestError("date_of_birth must be in YYYY-MM-DD format");
      }

      throw error;
    }
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
    const profile = await prisma.user_profiles.update({
      where: { user_id: userId },
      data: { avatar_path },
    });

    // Stary plik kasujemy PO udanym update — jeśli update by się nie udał
    // (np. profil jeszcze nie istnieje, update rzuciłby P2025), nowo
    // wgrany plik zostałby osierocony na dysku, ale stary nadal by istniał
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
    const profile = await prisma.user_profiles.update({
      where: { user_id: userId },
      data: { document_path, document_original_name: req.file.originalname },
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
