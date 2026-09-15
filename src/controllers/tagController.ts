import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

class TagController {
  // GET /tags — z liczbą postów per tag. _count to wbudowany w Prisma
  // odpowiednik naszego COUNT(pt.post_id) przez LEFT JOIN + GROUP BY.
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
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
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /tags/:id — tag + tytuły postów, które go używają
  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const tag = await prisma.tags.findUnique({
        where: { id },
        include: { post_tags: { include: { posts: true } } },
      });

      if (!tag) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      res.status(200).json({
        id: tag.id,
        name: tag.name,
        posts: tag.post_tags.map((postTag) => postTag.posts.title),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /tags
  public async createTag(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      const tag = await prisma.tags.create({ data: { name } });
      res.status(201).json(tag);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Tag with that name already exists" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /tags/:id — tagi to wspólny słownik: dowolny zalogowany user może
  // zmienić nazwę (requireCurrentUser w routach), bez sprawdzania "własności"
  public async updateTag(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { name } = req.body;
      const tag = await prisma.tags.update({ where: { id }, data: { name } });
      res.status(200).json(tag);
    } catch (error) {
      if (isNotFoundError(error)) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Tag with that name already exists" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // DELETE /tags/:id — post_tags czyści się samo (ON DELETE CASCADE)
  public async deleteTag(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      await prisma.tags.delete({ where: { id } });
      res.status(200).json({ message: "Tag deleted successfully" });
    } catch (error) {
      if (isNotFoundError(error)) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default TagController;
