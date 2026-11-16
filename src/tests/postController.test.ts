import { Request, Response } from "express";
import PostController from "../controllers/postController";
import prisma from "../db";

// Ten sam wzorzec co userController.test.ts — jawna fabryka mocka, żeby
// nie konstruować prawdziwego PrismaClienta. $transaction dostaje tablicę
// "zapytań" (wyników findMany/count), więc mock po prostu je rozwiązuje.
jest.mock("../db", () => ({
  __esModule: true,
  default: {
    posts: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((queries: unknown[]) => Promise.all(queries)),
  },
}));

const findMany = prisma.posts.findMany as jest.Mock;
const count = prisma.posts.count as jest.Mock;

const dbPost = {
  id: 1,
  title: "Hello",
  content: "World",
  created_at: new Date("2026-11-01T10:00:00Z"),
  users: { id: 7, name: "Alice", user_profiles: null },
  post_tags: [{ tags: { id: 3, name: "node" } }],
};

describe("PostController.getIndex", () => {
  const controller = new PostController();
  let json: jest.Mock;
  let res: Partial<Response>;

  const run = (query: Record<string, unknown>) =>
    controller.getIndex({ query } as unknown as Request, res as Response, jest.fn());

  beforeEach(() => {
    json = jest.fn();
    res = { status: jest.fn().mockReturnValue({ json }) };
    findMany.mockResolvedValue([dbPost]);
    count.mockResolvedValue(1);
  });

  afterEach(() => jest.clearAllMocks());

  it("zwraca pierwszą stronę od najnowszych, gdy nie ma parametrów", async () => {
    await run({});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: 0,
        take: 9,
      })
    );
    expect(json).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          id: 1,
          author_name: "Alice",
          tags: [{ id: 3, name: "node" }],
        }),
      ],
      pagination: { page: 1, limit: 9, total: 1 },
    });
  });

  it("łączy wyszukiwanie po tytule/treści z filtrem tagu i liczy offset", async () => {
    await run({ page: "3", limit: "6", q: "  prisma ", tagId: "3" });

    const where = {
      OR: [
        { title: { contains: "prisma", mode: "insensitive" } },
        { content: { contains: "prisma", mode: "insensitive" } },
      ],
      post_tags: { some: { tag_id: 3 } },
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 12, take: 6 }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("ignoruje sortowanie spoza whitelisty i przycina limit", async () => {
    await run({ sortBy: "password_hash", order: "asc", limit: "1000", tagId: "abc" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        take: 50,
      })
    );
  });

  it("sortuje po tytule, gdy o to poproszono", async () => {
    await run({ sortBy: "title", order: "asc" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ title: "asc" }, { id: "asc" }] })
    );
  });
});
