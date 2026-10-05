import { Request, Response } from "express";
import prisma from "../db";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { Prisma } from "../generated/prisma/client";

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";

// 23514 (check_violation na PESEL) nie jest "znanym" błędem dla Prismy —
// CHECK nie jest częścią schema.prisma (patrz komentarz przy modelu
// user_profiles), więc prawdziwy kod Postgresa trzeba wyciągnąć z
// error.meta.driverAdapterError.cause.code — sprawdzone naocznie
// (console.log całego error), nie zgadnięte z dokumentacji.
const pgErrorCode = (error: unknown): string | undefined => {
  const err = error as { meta?: { driverAdapterError?: { cause?: { code?: string } } } };
  return err.meta?.driverAdapterError?.cause?.code;
};

class UserProfileController {
  // GET /users/:id/profile — profil to dane prywatne (PESEL, telefon), więc
  // w odróżnieniu od postów NIE jest publiczny: tylko właściciel go czyta
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);

    if (userId !== req.currentUserId) {
      throw new ForbiddenError("Możesz przeglądać tylko własny profil.");
    }

    const profile = await prisma.user_profiles.findUnique({ where: { user_id: userId } });
    if (!profile) throw new NotFoundError("Profile not found");

    res.status(200).json(profile);
  });

  // PUT /users/:id/profile — upsert: relacja jest 1:1, więc "zapisz profil"
  // znaczy "stwórz, albo nadpisz jeśli już istnieje" w jednym zapytaniu.
  // Prisma ma to jako natywną operację .upsert() — nie trzeba ręcznego
  // ON CONFLICT.
  public upsert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);

    if (userId !== req.currentUserId) {
      throw new ForbiddenError("Możesz edytować tylko własny profil.");
    }

    const { pesel, date_of_birth, phone } = req.body;

    try {
      const profile = await prisma.user_profiles.upsert({
        where: { user_id: userId },
        update: { pesel, date_of_birth: new Date(date_of_birth), phone },
        create: { user_id: userId, pesel, date_of_birth: new Date(date_of_birth), phone },
      });
      res.status(200).json(profile);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("PESEL already used by another user");
      }
      if (isForeignKeyViolation(error)) {
        throw new NotFoundError("User not found");
      }

      const pgCode = pgErrorCode(error);
      if (pgCode === "23514") {
        throw new BadRequestError("PESEL must be exactly 11 digits");
      }
      if (pgCode === "22007" || pgCode === "22008") {
        throw new BadRequestError("date_of_birth must be in YYYY-MM-DD format");
      }

      throw error;
    }
  });

  // DELETE /users/:id/profile
  public deleteProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = parseInt(req.params.id);

    if (userId !== req.currentUserId) {
      throw new ForbiddenError("Możesz usunąć tylko własny profil.");
    }

    await prisma.user_profiles.delete({ where: { user_id: userId } });
    res.status(200).json({ message: "Profile deleted successfully" });
  });
}

export default UserProfileController;
