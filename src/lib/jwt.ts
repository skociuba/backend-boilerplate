import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d";

// "sub" to standardowa nazwa claimu JWT dla "czyj to token" — @types/jsonwebtoken
// typuje ją jako string (taki jest spec, RFC 7519), więc userId trzeba przez
// nią przepchnąć jako string i sparsować z powrotem przy odczycie.
//
// "role" leci TYLKO w access tokenie (nie w refresh) — dzięki temu
// requireAdmin sprawdza rolę bez zapytania do bazy przy każdym żądaniu.
// Cena: zmiana roli usera (np. awans na admina) widoczna jest dopiero po
// odnowieniu access tokena — maks. do 15 minut, albo od razu po ponownym
// zalogowaniu. Ten sam kompromis co przy "czy access token da się cofnąć
// przed czasem" — świadomie akceptowany, nie przeoczenie.
export type Role = "user" | "admin";
export type AccessTokenPayload = { sub: number; role: Role };
export type RefreshTokenPayload = { sub: number };

export const signAccessToken = (userId: number, role: Role): string =>
  jwt.sign({ sub: String(userId), role }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  } as jwt.SignOptions);

// "jti" (JWT ID) — losowy identyfikator DOKŁADNIE po to: bez niego dwa
// logowania tego samego usera w tej samej sekundzie (te same sub+iat+exp)
// dają BAJT W BAJT identyczny token → identyczny hash → INSERT do
// refresh_tokens wywala się na @unique (P2002). Złapane na żywo przy
// testowaniu — dwa curl-e do /auth/login w tej samej sekundzie.
export const signRefreshToken = (userId: number): string =>
  jwt.sign({ sub: String(userId), jti: randomUUID() }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  } as jwt.SignOptions);

// Zwraca null zamiast rzucać — wywołujący (middleware/kontroler) i tak musi
// obsłużyć "brak/zły token" jako zwykły przypadek, nie wyjątek.
export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload & { role?: Role };
    return decoded.sub && decoded.role
      ? { sub: parseInt(decoded.sub, 10), role: decoded.role }
      : null;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;
    return decoded.sub ? { sub: parseInt(decoded.sub, 10) } : null;
  } catch {
    return null;
  }
};

// Refresh tokeny NIE są hashowane bcryptem (jak hasła) — tu nie chodzi o
// "spowolnienie" ataku, tylko o to, żeby po włamaniu do bazy surowy token
// był bezużyteczny. Trzeba go móc też szybko WYSZUKAĆ po dokładnym
// dopasowaniu (WHERE token_hash = ...), a bcrypt z losową solą tego nie
// pozwala — każde wywołanie dałoby inny hash tej samej wartości.
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

// Wyciąga "exp" (unix timestamp w sekundach) wpisany przez jwt.sign z
// expiresIn — potrzebne, żeby zapisać w bazie DOKŁADNIE tę samą datę
// wygaśnięcia, jaką ma sam token, zamiast liczyć ją drugi raz osobno
// i ryzykować rozjazd o kilka sekund.
export const getTokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token) as { exp: number };
  return new Date(decoded.exp * 1000);
};
