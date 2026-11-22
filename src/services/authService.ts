import * as Sentry from "@sentry/node";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../lib/errors";
import {
  getTokenExpiry,
  hashToken,
  Role,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import logger from "../lib/logger";
import { sendActivationEmail, sendPasswordResetEmail } from "../lib/mailer";
import { comparePassword, hashPassword } from "../lib/password";
import { consumeVerificationToken, createVerificationToken } from "../lib/verificationTokens";

// Serwis zwraca tokeny jako DANE — o tym, że refresh token jedzie w
// httpOnly cookie, a access token w JSON-ie, decyduje warstwa HTTP
// (authController + lib/refreshCookie.ts). Tu nie ma ani req, ani res.

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const PUBLIC_USER_FIELDS = { id: true, name: true, email: true, role: true } as const;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Wspólne dla login/refresh. W bazie tylko HASH refresh tokena — wyciek
// tabeli nie daje gotowych tokenów do użycia.
async function issueTokenPair(userId: number, role: Role): Promise<TokenPair> {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = signRefreshToken(userId);
  const refreshExpiresAt = getTokenExpiry(refreshToken);

  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: hashToken(refreshToken),
      expires_at: refreshExpiresAt,
    },
  });

  return { accessToken, refreshToken, refreshExpiresAt };
}

// Unieważnia WSZYSTKIE aktywne sesje usera — logoutAll i reset hasła
async function revokeAllSessions(userId: number): Promise<void> {
  await prisma.refresh_tokens.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// Rejestracja NIE loguje od razu — konto istnieje, ale login() odrzuci je,
// dopóki email nie jest potwierdzony. To świadomy wybór: "załóż konto" i
// "zaloguj się" to dwa osobne kroki, rozdzielone kliknięciem linku z maila.
export async function register(input: { name: string; email: string; password: string }) {
  const password_hash = await hashPassword(input.password);

  // P2002 dostaje WŁASNY komunikat ("Ten email jest już zajęty"), a nie
  // generyczny z errorHandlera
  let user;
  try {
    user = await prisma.users.create({
      data: { name: input.name, email: input.email, password_hash },
      select: PUBLIC_USER_FIELDS,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Ten email jest już zajęty");
    throw error;
  }

  // Błąd wysyłki (np. dostawca akurat nie odpowiada) NIE blokuje
  // utworzenia konta — tylko log, bez throw; user i tak nie ma tu nic do
  // odebrania (tokenów nie wysyłamy), więc nieudana wysyłka nie zmienia
  // odpowiedzi.
  try {
    const token = await createVerificationToken(user.id, "account_activation");
    await sendActivationEmail(input.email, token);
  } catch (error) {
    // jw. w userService: rejestracja się udała, ale bez maila konta nie da
    // się aktywować — o tym ma przyjść alert
    logger.error({ err: error }, "Nie udało się wysłać maila aktywacyjnego");
    Sentry.captureException(error);
  }

  return user;
}

export async function login(email: string, password: string) {
  const user = await prisma.users.findUnique({ where: { email } });

  // Jedna odpowiedź dla "nie ma takiego emaila" i "złe hasło" —
  // rozróżnienie pozwoliłoby atakującemu sprawdzać, które adresy
  // istnieją w bazie (user enumeration).
  if (!user || !user.password_hash) {
    throw new UnauthorizedError("Nieprawidłowy email lub hasło");
  }
  if (!(await comparePassword(password, user.password_hash))) {
    throw new UnauthorizedError("Nieprawidłowy email lub hasło");
  }

  // PO sprawdzeniu hasła, nie przed — inaczej ten komunikat zdradzałby,
  // że email istnieje i hasło było poprawne, tylko konto nieaktywne
  // (ten sam powód enumeracji co wyżej, tylko jeden krok dalej).
  if (!user.email_verified_at) {
    throw new ForbiddenError("Potwierdź adres email — sprawdź skrzynkę, żeby się zalogować.");
  }

  const tokens = await issueTokenPair(user.id, user.role);
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tokens,
  };
}

// Rotacja: stary refresh token jest NATYCHMIAST unieważniany, nawet jeśli
// jego JWT-owy exp jeszcze nie minął. Powtórne użycie już zrotowanego
// tokena (typowy sygnał, że wyciekł) dostaje 401.
export async function refresh(refreshToken: string | undefined): Promise<TokenPair> {
  const invalidRefreshToken = () =>
    new UnauthorizedError("Refresh token nieprawidłowy lub wygasł");

  if (!refreshToken) throw invalidRefreshToken();

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) throw invalidRefreshToken();

  const stored = await prisma.refresh_tokens.findUnique({
    where: { token_hash: hashToken(refreshToken) },
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

  return issueTokenPair(payload.sub, user.role);
}

export async function getCurrentUser(userId: number) {
  const user = await prisma.users.findUnique({ where: { id: userId }, select: PUBLIC_USER_FIELDS });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

// Unieważnia TYLKO ten jeden refresh token (jedno urządzenie/sesję), nie
// wszystkie tokeny usera. Brak tokena to nie błąd — wylogowanie ma się
// zawsze "udać", nawet gdy ciastko już wygasło.
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await prisma.refresh_tokens.updateMany({
    where: { token_hash: hashToken(refreshToken), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

// Każdy niewygasły refresh token tego usera, nie tylko ten z bieżącego
// ciastka — np. gdy ktoś inny może mieć Twój refresh token (zgubiony
// telefon, publiczny komputer). Access tokeny innych urządzeń nadal będą
// działać do swojego naturalnego wygaśnięcia (do 15 min) — świadomy
// kompromis stateless access tokenów.
export const logoutAll = revokeAllSessions;

// Wywołujący ZAWSZE odpowiada tak samo, niezależnie od tego, czy taki
// email istnieje — rozróżnienie pozwoliłoby sprawdzać, które adresy są
// zarejestrowane (user enumeration), ten sam powód co w login().
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) return;

  const token = await createVerificationToken(user.id, "password_reset");
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const userId = await consumeVerificationToken(token, "password_reset");
  if (!userId) throw new BadRequestError("Link jest nieprawidłowy lub wygasł");

  // email_verified_at ustawiane TUTAJ też (nie tylko w verifyEmail) —
  // skonsumowanie tego tokena, niezależnie z jakiego maila (reset hasła
  // CZY ustawienie konta po admin-utworzeniu — patrz userService.
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
  await revokeAllSessions(userId);
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeVerificationToken(token, "account_activation");
  if (!userId) throw new BadRequestError("Link jest nieprawidłowy lub wygasł");

  await prisma.users.update({
    where: { id: userId },
    data: { email_verified_at: new Date() },
  });
}
