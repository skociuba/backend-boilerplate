import prisma from "../../db";
import { api, createVerifiedUser, resetDatabase, startServer } from "./helpers";

jest.mock("../../lib/mailer", () => ({
  sendActivationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendAccountSetupEmail: jest.fn(),
}));

// Mapowanie błędów Prismy na HTTP (P2002 → 409 z własnym komunikatem,
// P2025 → 404) da się sprawdzić tylko na prawdziwej bazie — mock nie
// rzuci prawdziwego PrismaClientKnownRequestError z unikalnego indeksu.
describe("tagi na prawdziwej bazie", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let http: ReturnType<typeof api>;
  let token: string;

  beforeAll(async () => {
    server = await startServer();
    http = api(server.baseUrl);
  });
  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    const ala = await createVerifiedUser("ala@example.com");
    ({ token } = await http.login(ala.email, ala.password));
  });

  it("tworzy, liczy posty, zmienia nazwę i usuwa", async () => {
    const tag = await http.post("/tags", { token, body: { name: "node" } });
    expect(tag.status).toBe(201);

    const post = await http.post("/posts", { token, body: { title: "Tytuł", content: "Treść" } });
    await http.put(`/posts/${post.body.id}/tags`, { token, body: { names: ["node"] } });

    const list = await http.get("/tags");
    expect(list.body).toEqual([{ id: tag.body.id, name: "node", posts_count: 1 }]);

    const details = await http.get(`/tags/${tag.body.id}`, { token });
    expect(details.body).toEqual({ id: tag.body.id, name: "node", posts: ["Tytuł"] });

    const renamed = await http.put(`/tags/${tag.body.id}`, { token, body: { name: "nodejs" } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("nodejs");

    expect((await http.delete(`/tags/${tag.body.id}`, { token })).status).toBe(200);
    expect((await http.get(`/tags/${tag.body.id}`, { token })).status).toBe(404);
  });

  it("odrzuca zajętą nazwę przy tworzeniu i zmianie nazwy", async () => {
    await http.post("/tags", { token, body: { name: "node" } });
    const other = await http.post("/tags", { token, body: { name: "react" } });

    const duplicate = await http.post("/tags", { token, body: { name: "node" } });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("Tag with that name already exists");

    const rename = await http.put(`/tags/${other.body.id}`, { token, body: { name: "node" } });
    expect(rename.status).toBe(409);
  });

  it("zwraca 404 przy zmianie nazwy nieistniejącego tagu", async () => {
    const res = await http.put("/tags/999", { token, body: { name: "x" } });
    expect(res.status).toBe(404);
  });
});
