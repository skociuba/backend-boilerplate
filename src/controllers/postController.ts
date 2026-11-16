import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { asyncHandler } from "../lib/asyncHandler";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { parsePagination, singleQueryParam } from "../lib/queryParams";

// Introspekcja dała nam JAWNĄ tabelę pośrednią (post_tags), więc Prisma
// zwraca tagi zagnieżdżone: post.post_tags[].tags.name — nie płasko jak w
// naszym ręcznym json_agg. Ta funkcja mapuje kształt Prismy z powrotem na
// kształt, jakiego oczekuje już istniejący frontend (author_id/author_name
// + płaska tablica tags: {id, name}[]) — ORM nie musi dyktować kształtu API.
// user_profiles jest relacją na USERS (1:1), nie na POSTS — stąd
// zagnieżdżenie "users: { include: { user_profiles: true } }", nie
// osobny klucz "user_profiles" na tym samym poziomie co "users". Avatar
// posta to w rzeczywistości "avatar autora posta", nie coś, co post sam
// posiada.
type PostWithRelations = Prisma.postsGetPayload<{
  include: {
    users: { include: { user_profiles: true } };
    post_tags: { include: { tags: true } };
  };
}>;

const toApiShape = (post: PostWithRelations) => ({
  id: post.id,
  title: post.title,
  content: post.content,
  created_at: post.created_at,
  author_id: post.users.id,
  author_name: post.users.name,
  author_avatar_url: post.users.user_profiles?.avatar_path ?? null,
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

// Rzuca 404/403 — dzielone przez update/delete/setTags, które wszystkie
// zaczynają się od tego samego sprawdzenia "czy to Twój post".
const requireOwnPost = async (postId: number, currentUserId: number | undefined) => {
  const ownerId = await getPostOwnerId(postId);
  if (ownerId === null) throw new NotFoundError("Post not found");
  if (ownerId !== currentUserId) {
    throw new ForbiddenError("Możesz edytować tylko własne posty.");
  }
};

// Whitelist jak w childController — sortować wolno tylko po tym, co
// faktycznie chcemy wystawić, nigdy po nazwie kolumny wziętej z URL-a.
const SORTABLE_FIELDS = ["created_at", "title"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

// Dłuższa fraza nic nie znajdzie, a ILIKE po długim wzorcu na każdym
// wierszu to niepotrzebny koszt — przycinamy zamiast odrzucać zapytanie.
const MAX_SEARCH_LENGTH = 100;

const POST_INCLUDE = {
  users: { include: { user_profiles: true } },
  post_tags: { include: { tags: true } },
} as const;

class PostController {
  // GET /posts?page=1&limit=9&sortBy=created_at&order=desc&q=prisma&tagId=3
  //
  // Publiczny feed ze strony głównej. Odpowiedź { items, pagination } —
  // ten sam kształt co GET /children, więc front ma jeden wzorzec listy.
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit, skip } = parsePagination(
      singleQueryParam(req.query.page),
      singleQueryParam(req.query.limit),
      { defaultLimit: 9, maxLimit: 50 }
    );

    const rawSortBy = singleQueryParam(req.query.sortBy);
    const sortBy: SortableField = SORTABLE_FIELDS.includes(rawSortBy as SortableField)
      ? (rawSortBy as SortableField)
      : "created_at";
    // Domyślnie od najnowszych — feed czyta się od góry
    const order: "asc" | "desc" = singleQueryParam(req.query.order) === "asc" ? "asc" : "desc";

    const q = singleQueryParam(req.query.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
    const tagId = parseInt(singleQueryParam(req.query.tagId) as string);

    // Brak parametru = brak filtra; oba filtry łączą się przez AND
    const where: Prisma.postsWhereInput = {};
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ];
    }
    if (Number.isInteger(tagId) && tagId > 0) {
      where.post_tags = { some: { tag_id: tagId } };
    }

    // id jako drugi klucz sortowania: przy równych created_at/title
    // kolejność bez niego jest w Postgresie niedeterministyczna, więc ten
    // sam post mógłby wypaść na dwóch stronach albo nie pojawić się wcale
    const [posts, total] = await prisma.$transaction([
      prisma.posts.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ [sortBy]: order }, { id: order }],
        skip,
        take: limit,
      }),
      prisma.posts.count({ where }),
    ]);

    res.status(200).json({
      items: posts.map(toApiShape),
      pagination: { page, limit, total },
    });
  });

  // GET /users/:id/posts — "moje posty", naprawdę wymuszone przez backend,
  // nie tylko przez to, jakie ID wyśle frontend. Dwie warstwy:
  // 1) requireCurrentUser (routes) — bez ważnego access tokenu w ogóle się
  //    tu nie wejdzie (401). To dzięki temu wygasły token realnie coś psuje
  //    i wyzwala cichy refresh po stronie frontu — wcześniej ten endpoint
  //    był publiczny, więc martwy token nikomu nie przeszkadzał.
  // 2) porównanie :id z req.currentUserId (niżej) — zalogowany, ale próbujący
  //    zajrzeć w cudze posty, dostaje 403, nie cudze dane.
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);

    if (userId !== req.currentUserId) {
      throw new ForbiddenError("Możesz przeglądać tylko własne posty.");
    }

    const posts = await prisma.posts.findMany({
      where: { user_id: userId },
      include: POST_INCLUDE,
      orderBy: { created_at: "desc" },
    });
    res.status(200).json(posts.map(toApiShape));
  });

  // GET /posts/:id — post + autor + tagi zagregowane z relacji N:M
  public getById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const post = await prisma.posts.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });

    if (!post) throw new NotFoundError("Post not found");

    res.status(200).json(toApiShape(post));
  });

  // POST /posts — wymaga requireCurrentUser; autorem jest ZAWSZE ten, kto
  // jest zalogowany (req.currentUserId), nigdy pole z body.
  public createPost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { title, content } = req.body;
    const post = await prisma.posts.create({
      data: {
        user_id: req.currentUserId as number,
        title,
        content,
      },
    });
    res.status(201).json(post);
  });

  // PUT /posts/:id — wymaga requireCurrentUser + bycia autorem tego posta
  public updatePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    await requireOwnPost(id, req.currentUserId);

    const { title, content } = req.body;
    const post = await prisma.posts.update({
      where: { id },
      data: { title, content },
    });

    res.status(200).json(post);
  });

  // DELETE /posts/:id — jw.; kasuje też wiersze w post_tags (ON DELETE
  // CASCADE zdefiniowany w bazie — Prisma nic tu dodatkowo nie robi)
  public deletePost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    await requireOwnPost(id, req.currentUserId);

    await prisma.posts.delete({ where: { id } });
    res.status(200).json({ message: "Post deleted successfully" });
  });

  // PUT /posts/:id/tags  { names: string[] } — USTAWIA cały zestaw tagów
  // posta na raz. Transakcja: wyczyść powiązania, znajdź-lub-stwórz każdy
  // tag, wstaw powiązania na nowo (skipDuplicates zamiast ON CONFLICT DO
  // NOTHING — na wypadek zduplikowanej nazwy w przesłanej liście).
  public setTags = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const postId = parseInt(req.params.id);
    await requireOwnPost(postId, req.currentUserId);

    const names: string[] = Array.isArray(req.body.names) ? req.body.names : [];

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
  });
}

export default PostController;
