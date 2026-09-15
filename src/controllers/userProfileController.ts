import { Request, Response } from "express";
import pool from "../db";

class UserProfileController {
  // GET /users/:id/profile — profil to dane prywatne (PESEL, telefon), więc
  // w odróżnieniu od postów NIE jest publiczny: tylko właściciel go czyta
  public async getByUserId(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);

      if (userId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz przeglądać tylko własny profil.",
        });
        return;
      }

      const result = await pool.query(
        `SELECT * FROM user_profiles WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }

      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /users/:id/profile — upsert: relacja jest 1:1, więc "zapisz profil"
  // znaczy "stwórz, albo nadpisz jeśli już istnieje" w jednym zapytaniu
  public async upsert(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);

      if (userId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz edytować tylko własny profil.",
        });
        return;
      }

      const { pesel, date_of_birth, phone } = req.body;

      const result = await pool.query(
        `INSERT INTO user_profiles (user_id, pesel, date_of_birth, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
           SET pesel = EXCLUDED.pesel,
               date_of_birth = EXCLUDED.date_of_birth,
               phone = EXCLUDED.phone
         RETURNING *`,
        [userId, pesel, date_of_birth, phone]
      );

      res.status(200).json(result.rows[0]);
    } catch (error) {
      const err = error as { code?: string; message: string };
      // 22007 = invalid_datetime_format, 22008 = datetime_field_overflow —
      // oba dostajemy np. dla "19.03.1983" zamiast "1983-03-19" (Postgres
      // nie rozpoznaje kolejności dzień.miesiąc.rok bez zmiany "datestyle")
      // 23514 = check_violation — format peselu z migracji (11 cyfr)
      // 23505 = unique_violation — pesel już przypisany innemu userowi
      // 23503 = foreign_key_violation — nie ma usera o takim id
      if (err.code === "22007" || err.code === "22008") {
        res
          .status(400)
          .json({ error: "date_of_birth must be in YYYY-MM-DD format" });
        return;
      }
      if (err.code === "23514") {
        res.status(400).json({ error: "PESEL must be exactly 11 digits" });
        return;
      }
      if (err.code === "23505") {
        res.status(409).json({ error: "PESEL already used by another user" });
        return;
      }
      if (err.code === "23503") {
        res.status(404).json({ error: "User not found" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: err.message });
    }
  }

  // DELETE /users/:id/profile
  public async deleteProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);

      if (userId !== req.currentUserId) {
        res.status(403).json({
          error: "Forbidden",
          message: "Możesz usunąć tylko własny profil.",
        });
        return;
      }

      const result = await pool.query(
        `DELETE FROM user_profiles WHERE user_id = $1`,
        [userId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }

      res.status(200).json({ message: "Profile deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default UserProfileController;
