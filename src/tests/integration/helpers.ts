import { Server } from "http";
import { AddressInfo } from "net";
import app from "../../app";
import prisma from "../../db";
import { hashPassword } from "../../lib/password";

// Prawdziwy serwer HTTP na losowym porcie (0 = wybierz wolny) — testy
// rozmawiają z aplikacją dokładnie tak jak przeglądarka/nginx: po HTTP,
// z nagłówkami i ciastkami, a nie przez wołanie kontrolerów.
export const startServer = async () => {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

// Każdy test zaczyna od pustych tabel. RESTART IDENTITY zeruje sekwencje
// id, CASCADE czyści też tabele zależne (post_tags, tokeny...).
// Lista z information_schema, a nie wpisana ręcznie — nowa tabela z
// migracji jest czyszczona bez pamiętania o tym pliku.
export const resetDatabase = async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

// Szybka ścieżka do zalogowanego usera w testach, które nie sprawdzają
// samej rejestracji: konto od razu aktywne, hasło prawdziwie zahashowane.
export const createVerifiedUser = async (
  email: string,
  password = "haslo-testowe-123",
  role: "user" | "admin" = "user"
) => {
  const user = await prisma.users.create({
    data: {
      name: email.split("@")[0],
      email,
      password_hash: await hashPassword(password),
      role,
      email_verified_at: new Date(),
    },
  });
  return { ...user, password };
};

type JsonResponse<T = any> = { status: number; body: T; cookies: string[] };

// Cienka nakładka na fetch: JSON w obie strony, opcjonalny Bearer token
// i ciastka (refresh token jest w httpOnly cookie, więc testy auth muszą
// je przenosić między zapytaniami ręcznie, jak robi to przeglądarka).
export const api = (baseUrl: string) => {
  const call = async <T = any>(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; cookie?: string } = {}
  ): Promise<JsonResponse<T>> => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.Cookie = options.cookie;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text ? JSON.parse(text) : undefined,
      cookies: res.headers.getSetCookie(),
    };
  };

  const login = async (email: string, password: string) => {
    const res = await call<{ accessToken: string; user: { id: number } }>("POST", "/auth/login", {
      body: { email, password },
    });
    if (res.status !== 200) throw new Error(`Logowanie nie powiodło się: ${res.status}`);
    return { token: res.body.accessToken, userId: res.body.user.id, cookies: res.cookies };
  };

  return {
    get: <T = any>(path: string, o?: { token?: string; cookie?: string }) => call<T>("GET", path, o),
    post: <T = any>(path: string, o?: { body?: unknown; token?: string; cookie?: string }) =>
      call<T>("POST", path, o),
    put: <T = any>(path: string, o?: { body?: unknown; token?: string }) => call<T>("PUT", path, o),
    delete: <T = any>(path: string, o?: { token?: string }) => call<T>("DELETE", path, o),
    login,
  };
};

// "refresh_token=abc; Path=/; HttpOnly" -> "refresh_token=abc"
export const cookieHeader = (setCookies: string[]) =>
  setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
