import { Request, Response } from "express";
import prisma from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { ConflictError, NotFoundError } from "../lib/errors";
import { Prisma } from "../generated/prisma/client";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

class TagController {
  // GET /tags — z liczbą postów per tag. _count to wbudowany w Prisma
  // odpowiednik naszego COUNT(pt.post_id) przez LEFT JOIN + GROUP BY.
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const tags = await prisma.tags.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { post_tags: true } } },
    });
    res.status(200).json(
      tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        posts_count: tag._count.post_tags,
      }))
    );
  });

  // GET /tags/:id — tag + tytuły postów, które go używają
  public getById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const tag = await prisma.tags.findUnique({
      where: { id },
      include: { post_tags: { include: { posts: true } } },
    });

    if (!tag) throw new NotFoundError("Tag not found");

    res.status(200).json({
      id: tag.id,
      name: tag.name,
      posts: tag.post_tags.map((postTag) => postTag.posts.title),
    });
  });

  // POST /tags — P2002 (nazwa zajęta) dostaje WŁASNY komunikat zamiast
  // generycznego z errorHandlera, stąd jedyny try/catch w tym pliku.
  public createTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body;
    try {
      const tag = await prisma.tags.create({ data: { name } });
      res.status(201).json(tag);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Tag with that name already exists");
      }
      throw error;
    }
  });

  // PUT /tags/:id — tagi to wspólny słownik: dowolny zalogowany user może
  // zmienić nazwę (requireCurrentUser w routach), bez sprawdzania "własności"
  public updateTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    try {
      const tag = await prisma.tags.update({ where: { id }, data: { name } });
      res.status(200).json(tag);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Tag with that name already exists");
      }
      throw error; // P2025 → errorHandler mapuje na 404
    }
  });

  // DELETE /tags/:id — post_tags czyści się samo (ON DELETE CASCADE)
  public deleteTag = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    await prisma.tags.delete({ where: { id } });
    res.status(200).json({ message: "Tag deleted successfully" });
  });
}

export default TagController;
