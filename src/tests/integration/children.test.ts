import prisma from "../../db";
import { api, createVerifiedUser, resetDatabase, startServer } from "./helpers";

jest.mock("../../lib/mailer", () => ({
  sendActivationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendAccountSetupEmail: jest.fn(),
}));

// Test jednostkowy serwisu (src/tests/childService.test.ts) sprawdza obiekt
// `where`; tu cała ścieżka HTTP → kontroler → serwis → SQL. Najważniejsze:
// izolacja między użytkownikami — "moje dzieci" nie mogą pokazać cudzych.
describe("dzieci na prawdziwej bazie", () => {
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

  const createChild = async (token: string, name: string, age: number) => {
    const res = await http.post("/children", {
      token,
      body: { name, age, date_of_birth: "2020-01-01" },
    });
    expect(res.status).toBe(201);
    return res.body;
  };

  it("wymaga zalogowania", async () => {
    expect((await http.get("/children")).status).toBe(401);
  });

  it("zwraca tylko dzieci zalogowanego użytkownika, z filtrami i paginacją", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const bob = await createVerifiedUser("bob@example.com");
    const { token: alaToken, userId: alaId } = await http.login(ala.email, ala.password);
    const { token: bobToken } = await http.login(bob.email, bob.password);

    const created = await createChild(alaToken, "Zosia", 3);
    expect(created.user_id).toBe(alaId);
    await createChild(alaToken, "Antek", 7);
    await createChild(alaToken, "Zuzia", 10);
    await createChild(bobToken, "Zenek", 5);

    const all = await http.get("/children?sortBy=age&order=desc", { token: alaToken });
    expect(all.status).toBe(200);
    expect(all.body.items.map((c: { name: string }) => c.name)).toEqual(["Zuzia", "Antek", "Zosia"]);
    expect(all.body.pagination).toEqual({ page: 1, limit: 10, total: 3 });

    const filtered = await http.get("/children?name=ZU&minAge=5", { token: alaToken });
    expect(filtered.body.items.map((c: { name: string }) => c.name)).toEqual(["Zuzia"]);

    const page2 = await http.get("/children?limit=2&page=2", { token: alaToken });
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.pagination.total).toBe(3);
  });
});
