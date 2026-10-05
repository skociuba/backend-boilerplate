import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { BadRequestError } from "../lib/errors";

// Fabryka middleware — jeden generyczny walidator, parametryzowany schemą
// na konkretny endpoint. safeParse (nie parse) celowo: parse rzuca
// wyjątek niekontrolowanie; safeParse zwraca zwykły obiekt
// { success, data | error }, z którego sami budujemy BadRequestError i
// przekazujemy go DALEJ przez next() — to errorHandler.ts (middleware/
// errorHandler.ts) faktycznie pisze odpowiedź 400, nie ten plik. Dzięki
// temu validateBody jest pierwszym konsumentem generycznego mechanizmu
// obsługi błędów, nie wyjątkiem od niego.
export const validateBody =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new BadRequestError("Nieprawidłowe dane", result.error.flatten().fieldErrors));
      return;
    }

    // req.body zastąpione SPARSOWANĄ wersją (np. email.trim()) — kontroler
    // dostaje już oczyszczone dane, nie musi sam przycinać białych znaków
    req.body = result.data;
    next();
  };
