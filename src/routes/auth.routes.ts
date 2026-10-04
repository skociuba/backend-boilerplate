import { Router } from "express";
import AuthController from "../controllers/authController";
import { requireCurrentUser } from "../middleware/currentUser";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerSchema } from "../lib/authValidation";

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post(
  "/auth/register",
  registerRateLimiter,
  validateBody(registerSchema),
  authController.register
);
authRoutes.post(
  "/auth/login",
  loginRateLimiter,
  validateBody(loginSchema),
  authController.login
);
authRoutes.post("/auth/refresh", authController.refresh);
authRoutes.post("/auth/logout", authController.logout);
authRoutes.post("/auth/logout-all", requireCurrentUser, authController.logoutAll);
authRoutes.get("/auth/me", requireCurrentUser, authController.me);

export default authRoutes;
