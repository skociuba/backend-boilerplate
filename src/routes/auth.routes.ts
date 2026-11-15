import { Router } from "express";
import AuthController from "../controllers/authController";
import { requireCurrentUser } from "../middleware/currentUser";
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
} from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../lib/authValidation";

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

authRoutes.post(
  "/auth/forgot-password",
  forgotPasswordRateLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);
authRoutes.post(
  "/auth/reset-password",
  validateBody(resetPasswordSchema),
  authController.resetPassword
);
authRoutes.post(
  "/auth/verify-email",
  validateBody(verifyEmailSchema),
  authController.verifyEmail
);

export default authRoutes;
