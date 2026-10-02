import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";

// Introspekcja dała nam JAWNĄ tabelę pośrednią (post_tags), więc Prisma
// zwraca tagi zagnieżdżone: post.post_tags[].tags.name — nie płasko jak w
// naszym ręcznym json_agg. Ta funkcja mapuje kształt Prismy z powrotem na
// kształt, jakiego oczekuje już istniejący frontend (author_id/author_name
// + płaska tablica tags: {id, name}[]) — ORM nie musi dyktować kształtu API.
type PostWithRelations = Prisma.postsGetPayload<{
  include: { users: true; post_tags: { include: { tags: true } } };
}>;

const toApiShape = (post: PostWithRelations) => ({
  id: post.id,
  title: post.title,
  content: post.content,
  created_at: post.created_at,
  author_id: post.users.id,
  author_name: post.users.name,
  tags: post.post_tags.map((postTag) => ({
    id: postTag.tags.id,
    name: postTag.tags.name,
  })),
});

// Wspólny check własności — zwraca null gdy post nie istnieje, inaczej jego
// user_id. Zwykła funkcja modułowa (nie metoda klasy!), bo metody kontrolera
// są w routach przekazywane jako gołe referencje bez .bind() — wewnątrz
// nich "this" jest undefined.
const getPostOwnerId = async (postId: number): Promise<number | null> => {
  const post = await prisma.posts.findUnique({
    where: { id: postId },
    select: { user_id: true },
  });
  return post?.user_id ?? null;
};

class PostController {
  // GET /posts — lista wszystkich postów wraz z autorem (1:N) i tagami (N:M)
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
      const posts = await prisma.posts.findMany({
        include: { users: true, post_tags: { include: { tags: true } } },
        orderBy: { created_at: "desc" },
      });
      res.status(200).json(posts.map(toApiShape));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /users/:id/posts — "moje posty", naprawdę wymuszone przez backend,
  // nie tylko przez to, jakie ID wyśle frontend. Dwie warstwy:
  // 1) requireCurrentUser (routes) — bez ważnego access tokenu w ogóle się
  //    tu nie wejdzie (401). To dzięki temu wygasły token realnie coś psuje
  //    i wyzwala cichy refresh po stronie frontu — wcześniej ten endpoint
  //    był publiczny, więc martwy token nikomu nie przeszkadzał.
  // 2) porównanie :id z req.currentUserId (niżej) — zalogowany, ale próbujący
  //    zajrzeć w cudze posty, dostaje 403, nie cudze dane.
  public async getByUserId(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);

      if (userId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz przeglądać tylko własne posty.",
        });
        return;
      }

      const posts = await prisma.posts.findMany({
        where: { user_id: userId },
        include: { users: true, post_tags: { include: { tags: true } } },
        orderBy: { created_at: "desc" },
      });
      res.status(200).json(posts.map(toApiShape));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /posts/:id — post + autor + tagi zagregowane z relacji N:M
  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const post = await prisma.posts.findUnique({
        where: { id },
        include: { users: true, post_tags: { include: { tags: true } } },
      });

      if (!post) {
        res.status(404).json({ error: "Post not found" });
        return;
      }

      res.status(200).json(toApiShape(post));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /posts — wymaga requireCurrentUser; autorem jest ZAWSZE ten, kto
  // jest zalogowany (req.currentUserId), nigdy pole z body.
  public async createPost(req: Request, res: Response): Promise<void> {
    try {
      const { title, content } = req.body;
      const post = await prisma.posts.create({
        data: {
          user_id: req.currentUserId as number,
          title,
          content,
        },
      });
      res.status(201).json(post);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /posts/:id — wymaga requireCurrentUser + bycia autorem tego posta
  public async updatePost(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const ownerId = await getPostOwnerId(id);

      if (ownerId === null) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      if (ownerId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz edytować tylko własne posty.",
        });
        return;
      }

      const { title, content } = req.body;
      const post = await prisma.posts.update({
        where: { id },
        data: { title, content },
      });

      res.status(200).json(post);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // DELETE /posts/:id — jw.; kasuje też wiersze w post_tags (ON DELETE
  // CASCADE zdefiniowany w bazie — Prisma nic tu dodatkowo nie robi)
  public async deletePost(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const ownerId = await getPostOwnerId(id);

      if (ownerId === null) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      if (ownerId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz usuwać tylko własne posty.",
        });
        return;
      }

      await prisma.posts.delete({ where: { id } });
      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /posts/:id/tags  { names: string[] } — USTAWIA cały zestaw tagów
  // posta na raz. Transakcja: wyczyść powiązania, znajdź-lub-stwórz każdy
  // tag, wstaw powiązania na nowo (skipDuplicates zamiast ON CONFLICT DO
  // NOTHING — na wypadek zduplikowanej nazwy w przesłanej liście).
  public async setTags(req: Request, res: Response): Promise<void> {
    const postId = parseInt(req.params.id);
    const ownerId = await getPostOwnerId(postId);

    if (ownerId === null) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (ownerId !== req.currentUserId) {
      res.status(403).json({
        error: "Forbidden",
        message: "Możesz tagować tylko własne posty.",
      });
      return;
    }

    try {
      const names: string[] = Array.isArray(req.body.names)
        ? req.body.names
        : [];

      await prisma.$transaction(async (tx) => {
        await tx.post_tags.deleteMany({ where: { post_id: postId } });

        const tags = await Promise.all(
          names.map((name) =>
            tx.tags.upsert({ where: { name }, update: {}, create: { name } })
          )
        );

        await tx.post_tags.createMany({
          data: tags.map((tag) => ({ post_id: postId, tag_id: tag.id })),
          skipDuplicates: true,
        });
      });

      res.status(200).json({ message: "Tags updated", tags: names });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default PostController;
