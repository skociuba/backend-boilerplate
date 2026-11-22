import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import { ConflictError, NotFoundError } from "../lib/errors";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// P2002 (nazwa zajęta) dostaje WŁASNY komunikat zamiast generycznego
// z errorHandlera — wspólne dla create i update
async function withUniqueName<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Tag with that name already exists");
    }
    throw error; // np. P2025 → errorHandler mapuje na 404
  }
}

// Lista z liczbą postów per tag. _count to wbudowany w Prisma
// odpowiednik COUNT(pt.post_id) przez LEFT JOIN + GROUP BY.
export async function listTags() {
  const tags = await prisma.tags.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { post_tags: true } } },
  });
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    posts_count: tag._count.post_tags,
  }));
}

// Tag + tytuły postów, które go używają
export async function getTag(id: number) {
  const tag = await prisma.tags.findUnique({
    where: { id },
    include: { post_tags: { include: { posts: true } } },
  });

  if (!tag) throw new NotFoundError("Tag not found");

  return {
    id: tag.id,
    name: tag.name,
    posts: tag.post_tags.map((postTag) => postTag.posts.title),
  };
}

export function createTag(name: string) {
  return withUniqueName(prisma.tags.create({ data: { name } }));
}

// Tagi to wspólny słownik: dowolny zalogowany user może zmienić nazwę
// (requireCurrentUser w routach), bez sprawdzania "własności"
export function renameTag(id: number, name: string) {
  return withUniqueName(prisma.tags.update({ where: { id }, data: { name } }));
}

// post_tags czyści się samo (ON DELETE CASCADE)
export async function deleteTag(id: number): Promise<void> {
  await prisma.tags.delete({ where: { id } });
}
