import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import { BadRequestError } from "./errors";

// Katalog NA DYSKU kontenera/maszyny, nie w bazie — baza trzyma tylko
// ścieżkę (patrz user_profiles.avatar_path/document_path w schema.prisma).
// To jest standardowy mechanizm dla małych/samodzielnie hostowanych
// projektów — S3/cloud storage to upgrade PRZY SKALI (wiele instancji
// backendu bez wspólnego dysku, CDN), nie wymóg do tego, żeby upload
// w ogóle zadziałał. Jedyny realny koszt tego podejścia: jeśli backend
// kiedyś będzie uruchomiony na wielu instancjach za load balancerem,
// każda z nich musiałaby mieć ten sam katalog (wspólny wolumen) —
// świadomy kompromis, nie przeoczenie.
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
export const AVATARS_DIR = path.join(UPLOADS_ROOT, "avatars");
export const DOCUMENTS_DIR = path.join(UPLOADS_ROOT, "documents");

// Wywołane raz, przy starcie (index.ts) — multer sam NIE tworzy katalogów,
// zapisanie pliku do nieistniejącego folderu po prostu wywaliłoby błąd.
export const ensureUploadDirs = (): void => {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
};

// Nazwa pliku na dysku to ZAWSZE losowy UUID + oryginalne rozszerzenie —
// NIGDY oryginalna nazwa klienta. Dwa powody: (1) dwóch userów może
// wgrać plik o identycznej nazwie, (2) nazwa z path traversal
// (np. "../../etc/passwd") nigdy nie dotyka systemu plików, bo w ogóle
// jej nie używamy do niczego poza wyciągnięciem rozszerzenia.
const diskStorage = (destination: string) =>
  multer.diskStorage({
    destination,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    cb(new BadRequestError("Avatar musi być PNG, JPEG albo WebP"));
    return;
  }
  cb(null, true);
};

const documentFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const allowed = ["application/pdf", "text/html"];
  if (!allowed.includes(file.mimetype)) {
    cb(new BadRequestError("Dokument musi być PDF albo HTML"));
    return;
  }
  cb(null, true);
};

export const uploadAvatar = multer({
  storage: diskStorage(AVATARS_DIR),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
}).single("avatar");

export const uploadDocument = multer({
  storage: diskStorage(DOCUMENTS_DIR),
  fileFilter: documentFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single("document");

// Usuwa stary plik przy zamianie na nowy / przy usunięciu profilu. Brak
// pliku (już skasowany, albo profil nigdy go nie miał) NIE jest błędem —
// stąd osobna, cicha obsługa ENOENT, a nie `fs.unlinkSync` na golasa.
export const deleteUploadedFile = (absolutePath: string | null | undefined): void => {
  if (!absolutePath) return;
  fs.unlink(absolutePath, (error) => {
    if (error && error.code !== "ENOENT") {
      console.error("Nie udało się usunąć pliku z dysku:", absolutePath, error);
    }
  });
};
