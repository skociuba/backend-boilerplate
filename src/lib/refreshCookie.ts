import { Response } from "express";

// Jedno miejsce z nazwą i opcjami ciasteczka — set i clear MUSZĄ używać
// dokładnie tych samych atrybutów (httpOnly/secure/sameSite/path), inaczej
// res.clearCookie() po cichu nie usunie ciastka ustawionego z innymi opcjami.
export const REFRESH_COOKIE_NAME = "refresh_token";

// Secure=false lokalnie (http://localhost — przeglądarki i tak traktują
// localhost jako "bezpieczny origin", ale nie ma co ryzykować w innych
// środowiskach dev bez HTTPS), Secure=true na produkcji (wymaga HTTPS —
// tam już jest, przez nginx).
const isProd = process.env.NODE_ENV === "production";

// Path="/" (nie np. "/auth/refresh") — bo backend nie wie, pod jakim
// prefiksem widzi go przeglądarka (lokalnie: przez /api-proxy Next.jsa,
// na produkcji: przez inny prefiks nginx). httpOnly + Secure + SameSite
// są tu warstwą ochrony, która robi robotę — Path to tylko dodatkowe
// zawężenie, niekrytyczne, więc zamiast zgadywać prefiks, zostawiamy "/".
const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

export const setRefreshCookie = (
  res: Response,
  token: string,
  expiresAt: Date
): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions);
};
