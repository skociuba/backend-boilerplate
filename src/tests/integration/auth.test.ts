import prisma from "../../db";
import { sendActivationEmail } from "../../lib/mailer";
import { api, cookieHeader, createVerifiedUser, resetDatabase, startServer } from "./helpers";

// Jedyny mock w testach integracyjnych: wysyłka maili. To granica systemu
// (zewnętrzny SMTP), a z mocka i tak wyciągamy prawdziwy token z linku —
// dokładnie ten, który user dostałby w mailu.
jest.mock("../../lib/mailer", () => ({
  sendActivationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountSetupEmail: jest.fn().mockResolvedValue(undefined),
}));

describe("auth na prawdziwej bazie", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let http: ReturnType<typeof api>;

  beforeAll(async () => {
    server = await startServer();
    http = api(server.baseUrl);
  });
  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });
  beforeEach(resetDatabase);

  it("rejestracja → link z maila → logowanie → /auth/me → odświeżenie → wylogowanie", async () => {
    const register = await http.post("/auth/register", {
      body: { name: "Ala Testowa", email: "ala@example.com", password: "tajne-haslo-1" },
    });
    expect(register.status).toBe(201);

    // Przed kliknięciem linku logowanie jest zablokowane
    const tooEarly = await http.post("/auth/login", {
      body: { email: "ala@example.com", password: "tajne-haslo-1" },
    });
    expect(tooEarly.status).toBe(403);

    // W bazie leży tylko hash tokenu, a surowy token poszedł "mailem"
    const [, rawToken] = (sendActivationEmail as jest.Mock).mock.calls[0];
    const stored = await prisma.verification_tokens.findFirstOrThrow();
    expect(stored.token_hash).not.toBe(rawToken);

    expect((await http.post("/auth/verify-email", { body: { token: rawToken } })).status).toBe(200);
    // Ten sam link drugi raz już nie działa
    expect((await http.post("/auth/verify-email", { body: { token: rawToken } })).status).toBe(400);

    const { token, cookies } = await http.login("ala@example.com", "tajne-haslo-1");
    const me = await http.get("/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual(
      expect.objectContaining({ email: "ala@example.com", name: "Ala Testowa", role: "user" })
    );
    // Hasła nie ma w żadnej odpowiedzi, nawet zahashowanego
    expect(JSON.stringify(me.body)).not.toContain("password");

    // Refresh token przyjeżdża tylko w httpOnly cookie
    expect(cookies.join(";")).toMatch(/refresh_token=.+HttpOnly/i);
    const refreshed = await http.post("/auth/refresh", { cookie: cookieHeader(cookies) });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    // Rotacja: stary refresh token po użyciu jest unieważniony
    const reused = await http.post("/auth/refresh", { cookie: cookieHeader(cookies) });
    expect(reused.status).toBe(401);

    const logout = await http.post("/auth/logout", { cookie: cookieHeader(refreshed.cookies) });
    expect(logout.status).toBe(200);
    expect((await http.post("/auth/refresh", { cookie: cookieHeader(refreshed.cookies) })).status).toBe(
      401
    );
  });

  it("odrzuca zajęty email i nie zdradza, czy konto istnieje przy złym haśle", async () => {
    await createVerifiedUser("bob@example.com", "dobre-haslo-1");

    const duplicate = await http.post("/auth/register", {
      body: { name: "Bob 2", email: "bob@example.com", password: "inne-haslo-1" },
    });
    expect(duplicate.status).toBe(409);

    const wrongPassword = await http.post("/auth/login", {
      body: { email: "bob@example.com", password: "zle-haslo-11" },
    });
    const noSuchUser = await http.post("/auth/login", {
      body: { email: "nikt@example.com", password: "zle-haslo-11" },
    });
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(noSuchUser.body);
  });

  it("zwraca 400 z opisem pól przy złych danych rejestracji", async () => {
    const res = await http.post("/auth/register", {
      body: { name: "", email: "to-nie-email", password: "krotkie" },
    });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details)).toEqual(
      expect.arrayContaining(["name", "email", "password"])
    );
  });

  it("GET /health widzi prawdziwą bazę", async () => {
    await expect(http.get("/health")).resolves.toEqual(
      expect.objectContaining({ status: 200, body: { status: "ok", database: "up" } })
    );
  });
});
