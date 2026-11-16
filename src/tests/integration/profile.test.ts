import prisma from "../../db";
import { api, createVerifiedUser, resetDatabase, startServer } from "./helpers";

jest.mock("../../lib/mailer", () => ({
  sendActivationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendAccountSetupEmail: jest.fn(),
}));

describe("profil na prawdziwej bazie", () => {
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

  it("zapisuje imię w users i resztę w user_profiles, a nowa nazwa trafia do postów", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const { token, userId } = await http.login(ala.email, ala.password);
    await http.post("/posts", { token, body: { title: "Mój post", content: "treść" } });

    // Profil jeszcze nie istnieje, a GET i tak zwraca imię
    const before = await http.get(`/users/${userId}/profile`, { token });
    expect(before.body).toEqual(expect.objectContaining({ name: "ala", date_of_birth: null }));

    const saved = await http.put(`/users/${userId}/profile`, {
      token,
      body: { name: "  Alicja Nowak ", date_of_birth: "1990-05-17", phone: "" },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(
      expect.objectContaining({ name: "Alicja Nowak", date_of_birth: "1990-05-17", phone: null })
    );

    // Typ DATE w Postgresie: bez przesunięcia o dzień przez strefę czasową
    const row = await prisma.user_profiles.findUniqueOrThrow({ where: { user_id: userId } });
    expect(row.date_of_birth?.toISOString().slice(0, 10)).toBe("1990-05-17");

    const feed = await http.get("/posts");
    expect(feed.body.items[0].author_name).toBe("Alicja Nowak");
  });

  it("odrzuca złe dane bez zapisywania czegokolwiek", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const { token, userId } = await http.login(ala.email, ala.password);

    const res = await http.put(`/users/${userId}/profile`, {
      token,
      body: { name: "Ala", date_of_birth: "2999-01-01", phone: "abc" },
    });

    expect(res.status).toBe(400);
    expect(await prisma.user_profiles.count()).toBe(0);
  });

  it("nie pozwala czytać ani zmieniać cudzego profilu", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const bob = await createVerifiedUser("bob@example.com");
    const alaSession = await http.login(ala.email, ala.password);

    expect((await http.get(`/users/${bob.id}/profile`, { token: alaSession.token })).status).toBe(403);
    expect(
      (await http.put(`/users/${bob.id}/profile`, { token: alaSession.token, body: { name: "x" } }))
        .status
    ).toBe(403);
    expect((await prisma.users.findUniqueOrThrow({ where: { id: bob.id } })).name).toBe("bob");
  });
});
