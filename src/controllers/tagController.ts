import { Request, Response } from "express";
import pool from "../db";

class TagController {
  // GET /tags — z liczbą postów per tag (COUNT przez LEFT JOIN po stronie N:M)
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT t.id, t.name, COUNT(pt.post_id)::int AS posts_count
         FROM tags t
         LEFT JOIN post_tags pt ON pt.tag_id = t.id
         GROUP BY t.id
         ORDER BY t.name`
      );
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /tags/:id — tag + tytuły postów, które go używają
  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const result = await pool.query(
        `SELECT t.id, t.name,
                COALESCE(
                  json_agg(p.title) FILTER (WHERE p.title IS NOT NULL), '[]'
                ) AS posts
         FROM tags t
         LEFT JOIN post_tags pt ON pt.tag_id = t.id
         LEFT JOIN posts p ON p.id = pt.post_id
         WHERE t.id = $1
         GROUP BY t.id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /tags
  public async createTag(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.body;
      const result = await pool.query(
        `INSERT INTO tags (name) VALUES ($1) RETURNING *`,
        [name]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      // 23505 = unique_violation — nazwa taga jest UNIQUE w migracji
      if ((error as { code?: string }).code === "23505") {
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
      const result = await pool.query(
        `UPDATE tags SET name = $1 WHERE id = $2 RETURNING *`,
        [name, id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
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
      const result = await pool.query(`DELETE FROM tags WHERE id = $1`, [id]);

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Tag not found" });
        return;
      }

      res.status(200).json({ message: "Tag deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default TagController;
