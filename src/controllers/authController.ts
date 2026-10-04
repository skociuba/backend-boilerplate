import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { hashPassword, comparePassword } from "../lib/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getTokenExpiry,
  Role,
} from "../lib/jwt";
import {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
} from "../lib/refreshCookie";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// Wspólne dla register/login/refresh. Access token wraca w JSON (klient go
// trzyma w pamięci, dokleja do nagłówka) — refresh token NIGDY nie trafia do
// JSON-a, tylko od razu jako httpOnly cookie (setRefreshCookie): JS po
// stronie klienta fizycznie nie ma jak go odczytać, więc nawet przy XSS
// atakujący nie wykradnie długożyjącego tokena, co dało się zrobić, gdy
// leciał w body i lądował w localStorage.
const issueTokenPair = async (
  res: Response,
  userId: number,
  role: Role
): Promise<{ accessToken: string }> => {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = signRefreshToken(userId);
  const expiresAt = getTokenExpiry(refreshToken);

  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
    },
  });

  setRefreshCookie(res, refreshToken, expiresAt);

  return { accessToken };
};

class AuthController {
  // POST /auth/register { name, email, password } — kształt i poprawność
  // (email.email(), password min. 8 znaków) sprawdzone już WCZEŚNIEJ przez
  // validateBody(registerSchema) w routach; tu req.body jest już zaufane.
  public async register(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, password } = req.body;
      const password_hash = await hashPassword(password);
      const user = await prisma.users.create({
        data: { name, email, password_hash },
        select: { id: true, name: true, email: true, role: true },
      });

      const tokens = await issueTokenPair(res, user.id, user.role);
      res.status(201).json({ user, ...tokens });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Ten email jest już zajęty" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /auth/login { email, password }
  public async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await prisma.users.findUnique({ where: { email } });

      // Jedna odpowiedź dla "nie ma takiego emaila" i "złe hasło" —
      // rozróżnienie pozwoliłoby atakującemu sprawdzać, które adresy
      // istnieją w bazie (user enumeration).
      const invalidCredentials = () =>
        res.status(401).json({ error: "Nieprawidłowy email lub hasło" });

      if (!user || !user.password_hash) {
        invalidCredentials();
        return;
      }

      const passwordMatches = await comparePassword(password, user.password_hash);
      if (!passwordMatches) {
        invalidCredentials();
        return;
      }

      const tokens = await issueTokenPair(res, user.id, user.role);
      res.status(200).json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        ...tokens,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /auth/refresh — BEZ body. Refresh token przyjeżdża sam, jako
  // ciastko (przeglądarka dokleja je automatycznie, bo httpOnly nie
  // znaczy "niewysyłane", tylko "niedostępne dla JS"). Rotacja: stary
  // refresh token jest NATYCHMIAST unieważniany, nawet jeśli jego JWT-owy
  // exp jeszcze nie minął. Powtórne użycie już zrotowanego tokena (typowy
  // sygnał, że wyciekł) dostaje 401.
  public async refresh(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!refreshToken) {
        res.status(401).json({ error: "Refresh token nieprawidłowy lub wygasł" });
        return;
      }

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        res.status(401).json({ error: "Refresh token nieprawidłowy lub wygasł" });
        return;
      }

      const tokenHash = hashToken(refreshToken);
      const stored = await prisma.refresh_tokens.findUnique({
        where: { token_hash: tokenHash },
      });

      if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
        res.status(401).json({ error: "Refresh token nieprawidłowy lub wygasł" });
        return;
      }

      await prisma.refresh_tokens.update({
        where: { id: stored.id },
        data: { revoked_at: new Date() },
      });

      // Rola czytana ŚWIEŻO z bazy, nie z payloadu (refresh token w ogóle
      // jej nie niesie) — dzięki temu ewentualny awans/degradacja widoczny
      // jest najpóźniej przy najbliższej rotacji, nie trzeba czekać na
      // ręczne wylogowanie.
      const user = await prisma.users.findUnique({
        where: { id: payload.sub },
        select: { role: true },
      });

      if (!user) {
        res.status(401).json({ error: "Refresh token nieprawidłowy lub wygasł" });
        return;
      }

      const tokens = await issueTokenPair(res, payload.sub, user.role);
      res.status(200).json(tokens);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /auth/me — "kim jestem" na podstawie access tokenu (requireCurrentUser
  // w routach). Główne zastosowanie: FRONT może tu realnie zweryfikować sesję
  // przy starcie appki (RequireAuth), zamiast ufać samej obecności danych
  // w localStorage — jeśli access token jest martwy, ten request naturalnie
  // przejdzie przez cichy refresh (patrz lib/api.ts), tak jak każdy inny.
  public async me(req: Request, res: Response): Promise<void> {
    try {
      const user = await prisma.users.findUnique({
        where: { id: req.currentUserId as number },
        select: { id: true, name: true, email: true, role: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /auth/logout — BEZ body, refresh token czytany z ciastka (jak przy
  // refresh). Unieważnia TYLKO ten jeden refresh token (jedno
  // urządzenie/sesję), nie wszystkie tokeny usera. Access token nadal będzie
  // działał do swojego naturalnego wygaśnięcia (do 15 min) — to świadomy
  // kompromis stateless access tokenów, nie przeoczenie.
  public async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (refreshToken) {
        await prisma.refresh_tokens.updateMany({
          where: { token_hash: hashToken(refreshToken), revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
      clearRefreshCookie(res);
      res.status(200).json({ message: "Wylogowano" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /auth/logout-all — wymaga requireCurrentUser (musisz mieć ważny
  // access token, żeby powiedzieć "zakończ WSZYSTKIE moje sesje"). W
  // odróżnieniu od logout() unieważnia KAŻDY niewygasły refresh token
  // tego usera, nie tylko ten z bieżącego ciastka — przydatne np. gdy
  // podejrzewasz, że ktoś inny ma Twój refresh token (zgubiony telefon,
  // publiczny komputer). Access tokeny innych urządzeń nadal będą działać
  // do swojego naturalnego wygaśnięcia (do 15 min) — ten sam kompromis co
  // zawsze przy stateless access tokenach.
  public async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      await prisma.refresh_tokens.updateMany({
        where: { user_id: req.currentUserId as number, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      clearRefreshCookie(res);
      res.status(200).json({ message: "Wylogowano ze wszystkich urządzeń" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default AuthController;
