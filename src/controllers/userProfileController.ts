import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2003";

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

      const profile = await prisma.user_profiles.findUnique({
        where: { user_id: userId },
      });

      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }

      res.status(200).json(profile);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // PUT /users/:id/profile — upsert: relacja jest 1:1, więc "zapisz profil"
  // znaczy "stwórz, albo nadpisz jeśli już istnieje" w jednym zapytaniu.
  // Prisma ma to jako natywną operację .upsert() — nie trzeba ręcznego
  // ON CONFLICT.
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

      const profile = await prisma.user_profiles.upsert({
        where: { user_id: userId },
        update: { pesel, date_of_birth: new Date(date_of_birth), phone },
        create: {
          user_id: userId,
          pesel,
          date_of_birth: new Date(date_of_birth),
          phone,
        },
      });

      res.status(200).json(profile);
    } catch (error) {
      // 23514 (check_violation na PESEL) nie jest "znanym" błędem dla
      // Prismy — CHECK nie jest częścią schema.prisma (patrz komentarz
      // przy modelu user_profiles), więc P2039 to ogólny kod Prismy
      // ("nieznany błąd bazy"), a prawdziwy kod Postgresa (23514) trzeba
      // wyciągnąć z error.meta.driverAdapterError.cause.code — sprawdzone
      // naocznie (console.log całego error), nie zgadnięte z dokumentacji
      const err = error as {
        code?: string;
        message: string;
        meta?: {
          driverAdapterError?: { cause?: { code?: string } };
        };
      };
      const pgCode = err.meta?.driverAdapterError?.cause?.code;

      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "PESEL already used by another user" });
        return;
      }
      if (isForeignKeyViolation(error)) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (pgCode === "23514") {
        res.status(400).json({ error: "PESEL must be exactly 11 digits" });
        return;
      }
      if (pgCode === "22007" || pgCode === "22008") {
        res
          .status(400)
          .json({ error: "date_of_birth must be in YYYY-MM-DD format" });
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

      await prisma.user_profiles.delete({ where: { user_id: userId } });
      res.status(200).json({ message: "Profile deleted successfully" });
    } catch (error) {
      if (isNotFoundError(error)) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default UserProfileController;
