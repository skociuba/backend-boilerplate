import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ForbiddenError } from "../lib/errors";
import { ProfileInput } from "../lib/profileValidation";
import * as profileService from "../services/userProfileService";

// Profil to dane prywatne, więc każda operacja na nim zaczyna się od tego
// samego sprawdzenia własności (userId z URL === req.currentUserId). Jest
// tutaj, a nie w serwisie, bo porównuje dwie rzeczy z żądania HTTP;
// serwis dostaje już tylko zweryfikowany userId.
const requireOwnProfile = (req: Request, message: string): number => {
  const userId = parseInt(req.params.id);
  if (userId !== req.currentUserId) {
    throw new ForbiddenError(message);
  }
  return userId;
};

class UserProfileController {
  // GET /users/:id/profile — profil to dane prywatne (telefon, data
  // urodzenia, dokument), więc w odróżnieniu od postów NIE jest publiczny:
  // tylko właściciel go czyta
  public getByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz przeglądać tylko własny profil.");
    res.status(200).json(await profileService.getProfile(userId));
  });

  // PUT /users/:id/profile { name, date_of_birth?, phone? } — body już
  // przeszło profileSchema (validateBody w routes)
  public upsert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz edytować tylko własny profil.");
    res.status(200).json(await profileService.saveProfile(userId, req.body as ProfileInput));
  });

  // PUT /users/:id/profile/avatar — multipart/form-data, pole "avatar"
  // (routes: uploadAvatar middleware z lib/uploads.ts parsuje go PRZED tym,
  // jak tu wchodzimy — req.file jest już zapisany na dysku)
  public uploadAvatar = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz zmienić tylko własny avatar.");
    if (!req.file) throw new BadRequestError("Brak pliku (pole 'avatar')");
    res.status(200).json(await profileService.setAvatar(userId, req.file.filename));
  });

  // PUT /users/:id/profile/document — jw., pole "document"
  public uploadDocument = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz zmienić tylko własny dokument.");
    if (!req.file) throw new BadRequestError("Brak pliku (pole 'document')");
    res.status(200).json(await profileService.setDocument(userId, req.file));
  });

  // GET /users/:id/profile/document — jedyne miejsce, które faktycznie
  // CZYTA zawartość dokumentu. requireOwnProfile tutaj jest krytyczne:
  // bez tego sprawdzenia ZALOGOWANY user mógłby pobrać CUDZY dokument,
  // znając tylko jego :id w URL-u (document_path na dysku jest losowym
  // UUID, ale endpoint i tak musi sam decydować, kto ma prawo go poprosić —
  // "trudne do odgadnięcia" to nie to samo co "chronione").
  public downloadDocument = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz pobrać tylko własny dokument.");
    const file = await profileService.getDocumentFile(userId);
    res.download(file.path, file.downloadName);
  });

  // DELETE /users/:id/profile
  public deleteProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = requireOwnProfile(req, "Możesz usunąć tylko własny profil.");
    await profileService.deleteProfile(userId);
    res.status(200).json({ message: "Profile deleted successfully" });
  });
}

export default UserProfileController;
