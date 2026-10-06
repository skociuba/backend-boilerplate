import { z } from "zod";

// Jeden plik ze schemami = jedno źródło prawdy o tym, czego endpoint
// oczekuje — zamiast rozsianych po kontrolerze ręcznych `if (!name...)`.
export const registerSchema = z.object({
  name: z.string().trim().min(1, "name jest wymagane"),
  email: z.string().trim().email("nieprawidłowy format email"),
  password: z.string().min(8, "hasło musi mieć minimum 8 znaków"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("nieprawidłowy format email"),
  password: z.string().min(1, "password jest wymagane"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("nieprawidłowy format email"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "token jest wymagany"),
  password: z.string().min(8, "hasło musi mieć minimum 8 znaków"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "token jest wymagany"),
});
