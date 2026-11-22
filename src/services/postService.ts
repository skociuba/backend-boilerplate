import path from "path";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { deleteUploadedFile } from "../lib/uploads";

// Introspekcja dała nam JAWNĄ tabelę pośrednią (post_tags), więc Prisma
// zwraca tagi zagnieżdżone: post.post_tags[].tags.name — nie płasko jak w
// naszym ręcznym json_agg. toApiShape mapuje kształt Prismy z powrotem na
// kształt, jakiego oczekuje już istniejący frontend (author_id/author_name
// + płaska tablica tags: {id, name}[]) — ORM nie musi dyktować kształtu API.
// user_profiles jest relacją na USERS (1:1), nie na POSTS — stąd
// zagnieżdżenie "users: { include: { user_profiles: true } }". Avatar
// posta to w rzeczywistości "avatar autora posta", nie coś, co post sam
// posiada.
const POST_INCLUDE = {
  users: { include: { user_profiles: true } },
  post_tags: { include: { tags: true } },
} as const;

type PostWithRelations = Prisma.postsGetPayload<{ include: typeof POST_INCLUDE }>;

const toApiShape = (post: PostWithRelations) => ({
  id: post.id,
  title: post.title,
  content: post.content,
  // Ścieżka względna (/uploads/posts/...), jak author_avatar_url — front
  // dokleja adres API przez getUploadUrl
  image_url: post.image_path,
  created_at: post.created_at,
  author_id: post.users.id,
  author_name: post.users.name,
  author_avatar_url: post.users.user_profiles?.avatar_path ?? null,
  tags: post.post_tags.map((postTag) => ({
    id: postTag.tags.id,
    name: postTag.tags.name,
  })),
});

// Ścieżki w bazie są względne do katalogu aplikacji ("/uploads/...")
const absolutePath = (storedPath: string) => path.join(process.cwd(), storedPath);

// Whitelist jak w childService — sortować wolno tylko po tym, co
// faktycznie chcemy wystawić, nigdy po nazwie kolumny wziętej z URL-a.
export const SORTABLE_FIELDS = ["created_at", "title"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

// Rzuca 404/403 — dzielone przez wszystkie operacje zapisu, które
// zaczynają się od tego samego sprawdzenia "czy to Twój post". W
// serwisie, nie w kontrolerze, bo wymaga zapytania do bazy.
async function requireOwnPost(postId: number, actorId: number) {
  const post = await prisma.posts.findUnique({
    where: { id: postId },
    select: { user_id: true, image_path: true },
  });
  if (!post) throw new NotFoundError("Post not found");
  if (post.user_id !== actorId) {
    throw new ForbiddenError("Możesz edytować tylko własne posty.");
  }
  return post;
}

export interface ListPostsOptions {
  skip: number;
  take: number;
  sortBy: SortableField;
  order: "asc" | "desc";
  q?: string;
  tagId?: number;
}

// Publiczny feed. Brak parametru = brak filtra; oba filtry łączą się przez AND
export async function listPosts({ skip, take, sortBy, order, q, tagId }: ListPostsOptions) {
  const where: Prisma.postsWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ];
  }
  if (tagId !== undefined) {
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
      take,
    }),
    prisma.posts.count({ where }),
  ]);

  return { items: posts.map(toApiShape), total };
}

export async function listPostsByAuthor(userId: number) {
  const posts = await prisma.posts.findMany({
    where: { user_id: userId },
    include: POST_INCLUDE,
    orderBy: { created_at: "desc" },
  });
  return posts.map(toApiShape);
}

// Post + autor + tagi zagregowane z relacji N:M
export async function getPost(id: number) {
  const post = await prisma.posts.findUnique({ where: { id }, include: POST_INCLUDE });
  if (!post) throw new NotFoundError("Post not found");
  return toApiShape(post);
}

// Autor jako osobny argument — ZAWSZE zalogowany user, nigdy pole z body
export function createPost(authorId: number, data: { title: string; content: string }) {
  return prisma.posts.create({ data: { user_id: authorId, ...data } });
}

export async function updatePost(
  actorId: number,
  postId: number,
  data: { title?: string; content?: string }
) {
  await requireOwnPost(postId, actorId);
  return prisma.posts.update({ where: { id: postId }, data });
}

// Kasuje też wiersze w post_tags (ON DELETE CASCADE zdefiniowany w bazie —
// Prisma nic tu dodatkowo nie robi)
export async function deletePost(actorId: number, postId: number): Promise<void> {
  await requireOwnPost(postId, actorId);
  const deleted = await prisma.posts.delete({ where: { id: postId } });
  // Wiersz w bazie i plik na dysku to dwa osobne zasoby — usunięcie posta
  // nie usuwa zdjęcia samo
  if (deleted.image_path) deleteUploadedFile(absolutePath(deleted.image_path));
}

// Multer (routes) zapisuje plik na dysk ZANIM tu wejdziemy, czyli także
// wtedy, gdy post jest cudzy albo nie istnieje — w takim przypadku plik
// trzeba sprzątnąć, inaczej każdy zalogowany mógłby zapychać dysk plikami
// podpiętymi pod nic.
export async function setImage(
  actorId: number,
  postId: number,
  file: { path: string; filename: string }
) {
  let previous;
  try {
    previous = await requireOwnPost(postId, actorId);
  } catch (error) {
    deleteUploadedFile(file.path);
    throw error;
  }

  const post = await prisma.posts.update({
    where: { id: postId },
    data: { image_path: `/uploads/posts/${file.filename}` },
    include: POST_INCLUDE,
  });

  // Stary plik dopiero PO udanym zapisie — gdyby update się nie udał,
  // baza dalej wskazywałaby na stary plik, więc musi on istnieć
  if (previous.image_path) deleteUploadedFile(absolutePath(previous.image_path));

  return toApiShape(post);
}

// Usuwa samo zdjęcie, post zostaje
export async function removeImage(actorId: number, postId: number) {
  const previous = await requireOwnPost(postId, actorId);

  const post = await prisma.posts.update({
    where: { id: postId },
    data: { image_path: null },
    include: POST_INCLUDE,
  });
  if (previous.image_path) deleteUploadedFile(absolutePath(previous.image_path));

  return toApiShape(post);
}

// USTAWIA cały zestaw tagów posta na raz. Transakcja: wyczyść powiązania,
// znajdź-lub-stwórz każdy tag, wstaw powiązania na nowo (skipDuplicates
// zamiast ON CONFLICT DO NOTHING — na wypadek zduplikowanej nazwy w liście).
export async function setTags(actorId: number, postId: number, names: string[]): Promise<void> {
  await requireOwnPost(postId, actorId);

  await prisma.$transaction(async (tx) => {
    await tx.post_tags.deleteMany({ where: { post_id: postId } });

    const tags = await Promise.all(
      names.map((name) => tx.tags.upsert({ where: { name }, update: {}, create: { name } }))
    );

    await tx.post_tags.createMany({
      data: tags.map((tag) => ({ post_id: postId, tag_id: tag.id })),
      skipDuplicates: true,
    });
  });
}
