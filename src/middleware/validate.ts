import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

// Fabryka middleware — jeden generyczny walidator, parametryzowany schemą
// na konkretny endpoint. safeParse (nie parse) celowo: parse rzuca
// wyjątek, który i tak trzeba by łapać osobnym try/catch; safeParse zwraca
// zwykły obiekt { success, data | error }, pasujący do reszty kontrolerów,
// gdzie błąd walidacji to zwykła odpowiedź 400, nie wyjątek.
export const validateBody =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Nieprawidłowe dane",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }

    // req.body zastąpione SPARSOWANĄ wersją (np. email.trim()) — kontroler
    // dostaje już oczyszczone dane, nie musi sam przycinać białych znaków
    req.body = result.data;
    next();
  };
