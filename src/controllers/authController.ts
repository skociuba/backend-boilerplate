import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { asyncHandler } from "../lib/asyncHandler";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors";
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
import { createVerificationToken, consumeVerificationToken } from "../lib/verificationTokens";
import { sendActivationEmail, sendPasswordResetEmail } from "../lib/mailer";

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
  // Brak try/catch: asyncHandler łapie odrzucony Promise i przekazuje go
  // do errorHandlera — jedyny wyjątek to P2002, bo tu chcemy WŁASNY
  // komunikat ("Ten email jest już zajęty"), a nie generyczny z errorHandlera.
  public register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;
    const password_hash = await hashPassword(password);

    let user;
    try {
      user = await prisma.users.create({
        data: { name, email, password_hash },
        select: { id: true, name: true, email: true, role: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Ten email jest już zajęty");
      }
      throw error;
    }

    // Rejestracja NIE loguje od razu — konto istnieje, ale login() (niżej)
    // odrzuci je, dopóki email nie jest potwierdzony. To świadomy wybór:
    // "załóż konto" i "zaloguj się" to teraz dwa osobne kroki, rozdzielone
    // kliknięciem linku z maila. Błąd wysyłki (np. dostawca akurat nie
    // odpowiada) NIE blokuje utworzenia konta — stąd osobny catch, tylko
    // log, bez throw; użytkownik i tak nie ma tu nic do odebrania w JSON-ie
    // (tokenów nie wysyłamy), więc nieudana wysyłka nie zmienia odpowiedzi.
    try {
      const token = await createVerificationToken(user.id, "account_activation");
      await sendActivationEmail(email, token);
    } catch (error) {
      console.error("Nie udało się wysłać maila aktywacyjnego:", error);
    }

    res.status(201).json({
      user,
      message: "Konto utworzone. Sprawdź maila, aby je aktywować, a potem się zaloguj.",
    });
  });

  // POST /auth/login { email, password }
  public login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const user = await prisma.users.findUnique({ where: { email } });

    // Jedna odpowiedź dla "nie ma takiego emaila" i "złe hasło" —
    // rozróżnienie pozwoliłoby atakującemu sprawdzać, które adresy
    // istnieją w bazie (user enumeration).
    if (!user || !user.password_hash) {
      throw new UnauthorizedError("Nieprawidłowy email lub hasło");
    }

    const passwordMatches = await comparePassword(password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedError("Nieprawidłowy email lub hasło");
    }

    // PO sprawdzeniu hasła, nie przed — inaczej ten komunikat zdradzałby,
    // że email istnieje i hasło było poprawne, tylko konto nieaktywne
    // (ten sam powód enumeracji co wyżej, tylko jeden krok dalej).
    if (!user.email_verified_at) {
      throw new ForbiddenError("Potwierdź adres email — sprawdź skrzynkę, żeby się zalogować.");
    }

    const tokens = await issueTokenPair(res, user.id, user.role);
    res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      ...tokens,
    });
  });

  // POST /auth/refresh — BEZ body. Refresh token przyjeżdża sam, jako
  // ciastko (przeglądarka dokleja je automatycznie, bo httpOnly nie
  // znaczy "niewysyłane", tylko "niedostępne dla JS"). Rotacja: stary
  // refresh token jest NATYCHMIAST unieważniany, nawet jeśli jego JWT-owy
  // exp jeszcze nie minął. Powtórne użycie już zrotowanego tokena (typowy
  // sygnał, że wyciekł) dostaje 401.
  public refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const invalidRefreshToken = () =>
      new UnauthorizedError("Refresh token nieprawidłowy lub wygasł");

    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) throw invalidRefreshToken();

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) throw invalidRefreshToken();

    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refresh_tokens.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
      throw invalidRefreshToken();
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
    if (!user) throw invalidRefreshToken();

    const tokens = await issueTokenPair(res, payload.sub, user.role);
    res.status(200).json(tokens);
  });

  // GET /auth/me — "kim jestem" na podstawie access tokenu (requireCurrentUser
  // w routach). Główne zastosowanie: FRONT może tu realnie zweryfikować sesję
  // przy starcie appki (RequireAuth), zamiast ufać samej obecności danych
  // w localStorage — jeśli access token jest martwy, ten request naturalnie
  // przejdzie przez cichy refresh (patrz lib/api.ts), tak jak każdy inny.
  public me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await prisma.users.findUnique({
      where: { id: req.currentUserId as number },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) throw new NotFoundError("User not found");

    res.status(200).json({ user });
  });

  // POST /auth/logout — BEZ body, refresh token czytany z ciastka (jak przy
  // refresh). Unieważnia TYLKO ten jeden refresh token (jedno
  // urządzenie/sesję), nie wszystkie tokeny usera. Access token nadal będzie
  // działał do swojego naturalnego wygaśnięcia (do 15 min) — to świadomy
  // kompromis stateless access tokenów, nie przeoczenie.
  public logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await prisma.refresh_tokens.updateMany({
        where: { token_hash: hashToken(refreshToken), revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }
    clearRefreshCookie(res);
    res.status(200).json({ message: "Wylogowano" });
  });

  // POST /auth/logout-all — wymaga requireCurrentUser (musisz mieć ważny
  // access token, żeby powiedzieć "zakończ WSZYSTKIE moje sesje"). W
  // odróżnieniu od logout() unieważnia KAŻDY niewygasły refresh token
  // tego usera, nie tylko ten z bieżącego ciastka — przydatne np. gdy
  // podejrzewasz, że ktoś inny ma Twój refresh token (zgubiony telefon,
  // publiczny komputer). Access tokeny innych urządzeń nadal będą działać
  // do swojego naturalnego wygaśnięcia (do 15 min) — ten sam kompromis co
  // zawsze przy stateless access tokenach.
  public logoutAll = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await prisma.refresh_tokens.updateMany({
      where: { user_id: req.currentUserId as number, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    clearRefreshCookie(res);
    res.status(200).json({ message: "Wylogowano ze wszystkich urządzeń" });
  });

  // POST /auth/forgot-password { email } — ZAWSZE ta sama odpowiedź,
  // niezależnie od tego, czy taki email istnieje w bazie. Rozróżnienie
  // ("nie ma takiego konta" vs "wysłano") pozwoliłoby komuś sprawdzać,
  // które adresy są zarejestrowane (user enumeration) — ten sam powód co
  // w login().
  public forgotPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    const user = await prisma.users.findUnique({ where: { email } });

    if (user) {
      const token = await createVerificationToken(user.id, "password_reset");
      await sendPasswordResetEmail(email, token);
    }

    res.status(200).json({
      message: "Jeśli to konto istnieje, wysłaliśmy na nie link do resetu hasła.",
    });
  });

  // POST /auth/reset-password { token, password }
  public resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, password } = req.body;
    const userId = await consumeVerificationToken(token, "password_reset");

    if (!userId) throw new BadRequestError("Link jest nieprawidłowy lub wygasł");

    // email_verified_at ustawiane TUTAJ też (nie tylko w verifyEmail) —
    // skonsumowanie tego tokena, niezależnie z jakiego maila (reset hasła
    // CZY ustawienie konta po admin-utworzeniu — patrz userController.
    // createUser), dowodzi, że user ma dostęp do tej skrzynki. Dla konta
    // admin-utworzonego to w ogóle JEDYNY moment weryfikacji — nie ma
    // osobnej aktywacji.
    const password_hash = await hashPassword(password);
    await prisma.users.update({
      where: { id: userId },
      data: { password_hash, email_verified_at: new Date() },
    });

    // Każdy, kto miał dostęp do starego hasła (albo do sesji założonej PRZED
    // resetem), traci dostęp — ten sam mechanizm co logoutAll. Bez tego
    // reset hasła nie wylogowywałby nikogo, kto już był zalogowany.
    await prisma.refresh_tokens.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    res.status(200).json({ message: "Hasło zmienione. Zaloguj się ponownie." });
  });

  // POST /auth/verify-email { token }
  public verifyEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.body;
    const userId = await consumeVerificationToken(token, "account_activation");

    if (!userId) throw new BadRequestError("Link jest nieprawidłowy lub wygasł");

    await prisma.users.update({
      where: { id: userId },
      data: { email_verified_at: new Date() },
    });

    res.status(200).json({ message: "Email potwierdzony" });
  });
}

export default AuthController;
