import { Request, Response } from "express";
import pool from "../db";

// Wspólny check własności — zwraca null gdy post nie istnieje, inaczej jego
// user_id. Zwykła funkcja modułowa (nie metoda klasy!), bo metody kontrolera
// są w routach przekazywane jako gołe referencje (np. postController.updatePost,
// patrz post.routes.ts) bez .bind() — wewnątrz nich "this" jest undefined.
const getPostOwnerId = async (postId: number): Promise<number | null> => {
  const result = await pool.query(`SELECT user_id FROM posts WHERE id = $1`, [
    postId,
  ]);
  return result.rows.length ? result.rows[0].user_id : null;
};

class PostController {
  // GET /posts — lista wszystkich postów wraz z autorem (1:N) i tagami (N:M)
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query(
        `SELECT p.id, p.title, p.content, p.created_at,
                u.id AS author_id, u.name AS author_name,
                COALESCE(
                  json_agg(json_build_object('id', t.id, 'name', t.name))
                    FILTER (WHERE t.id IS NOT NULL),
                  '[]'
                ) AS tags
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN post_tags pt ON pt.post_id = p.id
         LEFT JOIN tags t ON t.id = pt.tag_id
         GROUP BY p.id, u.id
         ORDER BY p.created_at DESC`
      );
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /users/:id/posts — strona "N" relacji 1:N widziana od strony usera
  public async getByUserId(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const result = await pool.query(
        `SELECT id, title, content, created_at
         FROM posts
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // GET /posts/:id — post + autor + tagi zagregowane z relacji N:M
  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const result = await pool.query(
        `SELECT p.id, p.title, p.content, p.created_at,
                u.id AS author_id, u.name AS author_name,
                COALESCE(
                  json_agg(json_build_object('id', t.id, 'name', t.name))
                    FILTER (WHERE t.id IS NOT NULL),
                  '[]'
                ) AS tags
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN post_tags pt ON pt.post_id = p.id
         LEFT JOIN tags t ON t.id = pt.tag_id
         WHERE p.id = $1
         GROUP BY p.id, u.id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Post not found" });
        return;
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // POST /posts — wymaga requireCurrentUser; autorem jest ZAWSZE ten, kto
  // jest zalogowany (req.currentUserId), nigdy pole z body. Gdyby user_id
  // przychodziło z body, każdy mógłby publikować posty jako ktoś inny.
  public async createPost(req: Request, res: Response): Promise<void> {
    try {
      const { title, content } = req.body;
      const result = await pool.query(
        `INSERT INTO posts (user_id, title, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.currentUserId, title, content]
      );
      res.status(201).json(result.rows[0]);
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
      const result = await pool.query(
        `UPDATE posts SET title = $1, content = $2 WHERE id = $3 RETURNING *`,
        [title, content, id]
      );

      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // DELETE /posts/:id — jw.; kasuje też wiersze w post_tags (ON DELETE CASCADE)
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

      await pool.query(`DELETE FROM posts WHERE id = $1`, [id]);
      res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /posts/:id/tags  { names: string[] } — USTAWIA cały zestaw tagów
  // posta na raz (idempotentne "od teraz post ma dokładnie te tagi"),
  // zamiast osobnych "dodaj jeden"/"usuń jeden". Pasuje 1:1 do multi-selecta
  // z checkboxami na froncie: submit zawsze wysyła pełną, aktualną listę.
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

    const client = await pool.connect();
    try {
      const names: string[] = Array.isArray(req.body.names)
        ? req.body.names
        : [];

      await client.query("BEGIN");

      // najprościej: wyczyść wszystkie powiązania tego posta i zbuduj je
      // od nowa z przesłanej listy — nie trzeba osobno liczyć różnicy
      // (co dodać, co usunąć), a transakcja gwarantuje że nikt nie zobaczy
      // pośredniego, "pustego" stanu
      await client.query(`DELETE FROM post_tags WHERE post_id = $1`, [
        postId,
      ]);

      for (const name of names) {
        // find-or-create po nazwie — ON CONFLICT DO UPDATE (zamiast DO
        // NOTHING) tylko po to, żeby RETURNING zawsze zwróciło id
        const tagResult = await client.query(
          `INSERT INTO tags (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [name]
        );
        const tagId = tagResult.rows[0].id;

        await client.query(
          `INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [postId, tagId]
        );
      }

      await client.query("COMMIT");
      res.status(200).json({ message: "Tags updated", tags: names });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    } finally {
      client.release();
    }
  }
}

export default PostController;
