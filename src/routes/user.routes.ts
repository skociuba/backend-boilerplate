import { Router } from "express";
import UserController from "../controllers/userController";
import { requireAdmin } from "../middleware/currentUser";

const userRoutes = Router();
const userController = new UserController();

// Moduł "zarządzanie userami" — tylko admin. To pierwszy endpoint w
// projekcie chroniony autoryzacją PO ROLI, nie po własności zasobu
// (w odróżnieniu od postów/dzieci, gdzie chodziło o "czy to Twoje").
// requireAdmin sam sprawdza i logowanie (401), i rolę (403).
userRoutes.get("/users", requireAdmin, userController.getIndex);
userRoutes.post("/users", requireAdmin, userController.createUser);
userRoutes.post(
  "/usersTransaction",
  requireAdmin,
  userController.createUserTransaction
);
userRoutes.get("/users/:id", requireAdmin, userController.getUserById);
userRoutes.put("/users/:id", requireAdmin, userController.updateUser);
userRoutes.delete("/users/:id", requireAdmin, userController.deleteUser);

export default userRoutes;
