import { Router } from "express";
import AuthController from "../controllers/authController";
import { requireCurrentUser } from "../middleware/currentUser";

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post("/auth/register", authController.register);
authRoutes.post("/auth/login", authController.login);
authRoutes.post("/auth/refresh", authController.refresh);
authRoutes.post("/auth/logout", authController.logout);
authRoutes.get("/auth/me", requireCurrentUser, authController.me);

export default authRoutes;
