import { Router } from "express";
import UserProfileController from "../controllers/userProfileController";
import { requireCurrentUser } from "../middleware/currentUser";

const userProfileRoutes = Router();
const userProfileController = new UserProfileController();

// relacja 1:1 — zawsze widziana "od strony" usera. W odróżnieniu od postów
// i tagów, profil jest prywatny: requireCurrentUser + sprawdzenie własności
// (userId z URL === req.currentUserId) jest w każdej z tych trzech metod.
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

export default userProfileRoutes;
