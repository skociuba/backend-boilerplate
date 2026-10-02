import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, Role } from "../lib/jwt";

// Docelowa wersja (poprzednio: czytanie surowego nagłówka x-user-id).
// Cel tego pliku pozostaje ten sam: dostarczyć req.currentUserId (teraz też
// req.currentUserRole) dla kontrolerów — kontrolery, routy i logika
// autoryzacji (kto może edytować co) w ogóle nie wiedzą, że coś się zmieniło.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUserId?: number;
      currentUserRole?: Role;
    }
  }
}

export const attachCurrentUser = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const payload = token ? verifyAccessToken(token) : null;

  // Token brakujący, wygasły albo podrobiony — payload jest po prostu null,
  // oba pola zostają undefined. To NIE jest błąd sam w sobie: wiele
  // endpointów (np. GET /posts) działa też bez logowania.
  req.currentUserId = payload?.sub;
  req.currentUserRole = payload?.role;
  next();
};

// Autentykacja: "czy w ogóle wiem kim jesteś". 401, nie 403 — brak dowodu
// tożsamości, nie brak uprawnień.
export const requireCurrentUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.currentUserId) {
    res.status(401).json({
      error: "Not authenticated",
      message:
        "Musisz być zalogowany (nagłówek Authorization: Bearer <access token>).",
    });
    return;
  }
  next();
};

// Autoryzacja: "wiem kim jesteś, ale czy wolno Ci to zrobić". Samodzielna —
// sprawdza i brak logowania (401), i złą rolę (403) — więc działa użyta
// solo w routach, bez konieczności dokładania obok requireCurrentUser.
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.currentUserId) {
    res.status(401).json({
      error: "Not authenticated",
      message:
        "Musisz być zalogowany (nagłówek Authorization: Bearer <access token>).",
    });
    return;
  }
  if (req.currentUserRole !== "admin") {
    res.status(403).json({
      error: "Forbidden",
      message: "Ten zasób jest dostępny tylko dla administratorów.",
    });
    return;
  }
  next();
};
