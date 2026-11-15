import { Router } from "express";
import UserProfileController from "../controllers/userProfileController";
import { requireCurrentUser } from "../middleware/currentUser";
import { uploadAvatar, uploadDocument } from "../lib/uploads";

const userProfileRoutes = Router();
const userProfileController = new UserProfileController();

// relacja 1:1 — zawsze widziana "od strony" usera. W odróżnieniu od postów
// i tagów, profil jest prywatny: requireCurrentUser + sprawdzenie własności
// (userId z URL === req.currentUserId) jest w każdej z tych metod.
userProfileRoutes.get(
  "/users/:id/profile",
  requireCurrentUser,
  userProfileController.getByUserId
);
userProfileRoutes.put(
  "/users/:id/profile",
  requireCurrentUser,
  userProfileController.upsert
);
userProfileRoutes.delete(
  "/users/:id/profile",
  requireCurrentUser,
  userProfileController.deleteProfile
);

// uploadAvatar/uploadDocument (multer, lib/uploads.ts) parsują
// multipart/form-data i zapisują plik na dysk PRZED kontrolerem — jeśli
// fileFilter/limit go odrzuci, next(error) leci prosto do errorHandlera,
// kontroler w ogóle się nie odpala.
userProfileRoutes.put(
  "/users/:id/profile/avatar",
  requireCurrentUser,
  uploadAvatar,
  userProfileController.uploadAvatar
);
userProfileRoutes.put(
  "/users/:id/profile/document",
  requireCurrentUser,
  uploadDocument,
  userProfileController.uploadDocument
);
userProfileRoutes.get(
  "/users/:id/profile/document",
  requireCurrentUser,
  userProfileController.downloadDocument
);

export default userProfileRoutes;
