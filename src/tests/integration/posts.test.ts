import prisma from "../../db";
import { api, createVerifiedUser, resetDatabase, startServer } from "./helpers";

jest.mock("../../lib/mailer", () => ({
  sendActivationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendAccountSetupEmail: jest.fn(),
}));

// Tu testy jednostkowe (src/tests/postController.test.ts) sprawdzają tylko,
// jaki obiekt `where` kontroler przekazuje Prismie. Dopiero prawdziwa baza
// pokazuje, czy z tego wychodzi poprawny SQL: wielkość liter w ILIKE,
// filtr przez tabelę łączącą N:M, stabilna kolejność przy paginacji.
describe("posty na prawdziwej bazie", () => {
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

  const createPost = async (token: string, title: string, content: string, tags: string[] = []) => {
    const created = await http.post("/posts", { token, body: { title, content } });
    expect(created.status).toBe(201);
    if (tags.length) {
      const tagged = await http.put(`/posts/${created.body.id}/tags`, { token, body: { names: tags } });
      expect(tagged.status).toBe(200);
    }
    return created.body.id as number;
  };

  it("szuka bez względu na wielkość liter, filtruje po tagu i stronicuje", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const { token } = await http.login(ala.email, ala.password);

    await createPost(token, "Prisma w praktyce", "migracje i relacje", ["node"]);
    await createPost(token, "Ogród", "róże i tulipany", ["przyroda"]);
    await createPost(token, "Express", "middleware, a w tle PRISMA", ["node", "backend"]);
    for (let i = 1; i <= 7; i += 1) await createPost(token, `Wpis ${i}`, "treść");

    const search = await http.get("/posts?q=prisma");
    expect(search.body.pagination.total).toBe(2);
    expect(search.body.items.map((p: { title: string }) => p.title).sort()).toEqual([
      "Express",
      "Prisma w praktyce",
    ]);

    const nodeTag = await prisma.tags.findUniqueOrThrow({ where: { name: "node" } });
    const byTag = await http.get(`/posts?tagId=${nodeTag.id}&q=middleware`);
    expect(byTag.body.items.map((p: { title: string }) => p.title)).toEqual(["Express"]);
    expect(byTag.body.items[0].tags.map((t: { name: string }) => t.name).sort()).toEqual([
      "backend",
      "node",
    ]);

    // 10 postów, po 4 na stronę: strony się nie nakładają i razem dają wszystko
    const pages = await Promise.all([1, 2, 3].map((page) => http.get(`/posts?limit=4&page=${page}`)));
    const ids = pages.flatMap((p) => p.body.items.map((post: { id: number }) => post.id));
    expect(pages.map((p) => p.body.items.length)).toEqual([4, 4, 2]);
    expect(new Set(ids).size).toBe(10);
    expect(pages[0].body.pagination).toEqual({ page: 1, limit: 4, total: 10 });

    const byTitle = await http.get("/posts?sortBy=title&order=asc&limit=3");
    expect(byTitle.body.items.map((p: { title: string }) => p.title)).toEqual([
      "Express",
      "Ogród",
      "Prisma w praktyce",
    ]);
  });

  it("nie pozwala edytować ani usuwać cudzego posta", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const bob = await createVerifiedUser("bob@example.com");
    const alaSession = await http.login(ala.email, ala.password);
    const bobSession = await http.login(bob.email, bob.password);
    const postId = await createPost(alaSession.token, "Post Ali", "treść");

    expect((await http.put(`/posts/${postId}`, { token: bobSession.token, body: { title: "x" } })).status).toBe(403);
    expect((await http.delete(`/posts/${postId}`, { token: bobSession.token })).status).toBe(403);
    expect((await http.post("/posts", { body: { title: "bez logowania" } })).status).toBe(401);

    // Post Ali nietknięty
    const post = await http.get(`/posts/${postId}`);
    expect(post.body.title).toBe("Post Ali");
  });

  it("usunięcie posta kasuje też jego powiązania z tagami (ON DELETE CASCADE)", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const { token } = await http.login(ala.email, ala.password);
    const postId = await createPost(token, "Do usunięcia", "treść", ["node", "backend"]);

    expect(await prisma.post_tags.count()).toBe(2);
    expect((await http.delete(`/posts/${postId}`, { token })).status).toBe(200);

    expect(await prisma.post_tags.count()).toBe(0);
    // Same tagi zostają — to wspólny słownik, nie własność posta
    expect(await prisma.tags.count()).toBe(2);
  });

  // Express 5 nie ustawia już req.body = {} dla żądania bez body (było tak w
  // 4.x) — kontrolery destrukturyzujące req.body padały wtedy z 500.
  // Bez body PUT /posts/:id/tags ma zadziałać jak pusta lista tagów.
  it("żądanie bez body nie kończy się błędem serwera", async () => {
    const ala = await createVerifiedUser("ala@example.com");
    const { token } = await http.login(ala.email, ala.password);
    const postId = await createPost(token, "Z tagami", "treść", ["node"]);

    const res = await http.put(`/posts/${postId}/tags`, { token });

    expect(res.status).toBe(200);
    expect(await prisma.post_tags.count()).toBe(0);
  });
});
