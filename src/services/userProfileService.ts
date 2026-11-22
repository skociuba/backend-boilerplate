import path from "path";
import prisma from "../db";
import { NotFoundError } from "../lib/errors";
import { ProfileInput } from "../lib/profileValidation";
import { deleteUploadedFile } from "../lib/uploads";

// Wszystkie funkcje dostają userId JUŻ sprawdzony pod kątem własności
// (kontroler porównuje :id z URL z req.currentUserId) — serwis nie wie,
// kto pyta, tylko o czyj profil chodzi.

// Ścieżki w bazie są względne do katalogu aplikacji ("/uploads/...")
const absolutePath = (storedPath: string) => path.join(process.cwd(), storedPath);

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
  // endpoint, front nie ma po co znać document_path.
  document_original_name: profile?.document_original_name ?? null,
});

export async function getProfile(userId: number) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { name: true, user_profiles: true },
  });
  if (!user) throw new NotFoundError("User not found");

  return toProfileResponse(userId, user.name, user.user_profiles);
}

// Imię i nazwisko jest w users, reszta w user_profiles — $transaction,
// żeby nie zapisać jednego bez drugiego. Upsert, bo relacja jest 1:1:
// "zapisz profil" = stwórz albo nadpisz, bez ręcznego ON CONFLICT.
export async function saveProfile(userId: number, { name, date_of_birth, phone }: ProfileInput) {
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

  return toProfileResponse(userId, user.name, profile);
}

// Avatar jest PUBLICZNY (zdjęcie, nie dokument prywatny) — ścieżka w DB,
// a plik serwowany statycznie (patrz app.ts: /uploads/avatars). Plik jest
// już zapisany na dysku przez middleware uploadu, tu tylko go podpinamy.
export async function setAvatar(userId: number, filename: string) {
  const existing = await prisma.user_profiles.findUnique({
    where: { user_id: userId },
    select: { avatar_path: true },
  });

  const avatar_path = `/uploads/avatars/${filename}`;
  // upsert, nie update: wszystkie pola profilu są opcjonalne, więc avatar
  // można wgrać, zanim ktokolwiek zapisze formularz profilu
  const profile = await prisma.user_profiles.upsert({
    where: { user_id: userId },
    update: { avatar_path },
    create: { user_id: userId, avatar_path },
  });

  // Stary plik kasujemy PO udanym zapisie — gdyby zapis się nie udał,
  // stary avatar musi nadal istnieć, bo baza wciąż na niego wskazuje
  if (existing?.avatar_path) deleteUploadedFile(absolutePath(existing.avatar_path));

  return profile;
}

// Dokument jest PRYWATNY (może być np. skan dowodu) — w odróżnieniu od
// avatara NIE ma statycznego URL-a, tylko chroniony endpoint pobierania.
export async function setDocument(
  userId: number,
  file: { filename: string; originalname: string }
) {
  const existing = await prisma.user_profiles.findUnique({
    where: { user_id: userId },
    select: { document_path: true },
  });

  const documentData = {
    document_path: `/uploads/documents/${file.filename}`,
    document_original_name: file.originalname,
  };
  const profile = await prisma.user_profiles.upsert({
    where: { user_id: userId },
    update: documentData,
    create: { user_id: userId, ...documentData },
  });

  if (existing?.document_path) deleteUploadedFile(absolutePath(existing.document_path));

  return profile;
}

// Zwraca, CO wysłać (ścieżka + nazwa dla przeglądarki); samo wysłanie
// pliku (res.download) to już sprawa warstwy HTTP
export async function getDocumentFile(userId: number) {
  const profile = await prisma.user_profiles.findUnique({
    where: { user_id: userId },
    select: { document_path: true, document_original_name: true },
  });

  if (!profile?.document_path) throw new NotFoundError("Document not found");

  return {
    path: absolutePath(profile.document_path),
    downloadName: profile.document_original_name ?? "document",
  };
}

export async function deleteProfile(userId: number): Promise<void> {
  const profile = await prisma.user_profiles.delete({ where: { user_id: userId } });

  // Wiersz w bazie i pliki na dysku to DWA osobne zasoby — usunięcie
  // jednego nie usuwa drugiego automatycznie, trzeba obsłużyć ręcznie.
  if (profile.avatar_path) deleteUploadedFile(absolutePath(profile.avatar_path));
  if (profile.document_path) deleteUploadedFile(absolutePath(profile.document_path));
}
