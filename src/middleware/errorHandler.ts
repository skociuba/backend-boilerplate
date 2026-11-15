import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";

// Trasa, której żaden route nie złapał — osobno od errorHandlera, bo to nie
// jest "błąd" w sensie wyjątku, tylko normalny, końcowy przypadek routingu
// (zarejestrowany PO wszystkich prawdziwych routach w index.ts).
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Nie znaleziono trasy ${req.method} ${req.path}` });
};

// Mapowanie znanych kodów Prismy na HTTP — to samo rozróżnienie, które
// wcześniej każdy kontroler powtarzał osobno jako isNotFoundError /
// isUniqueViolation / isForeignKeyViolation. Teraz ono mieszka w jednym
// miejscu: kontroler nie musi w ogóle wiedzieć, że baza to Postgres przez
// Prismę — rzuca NotFoundError/ConflictError tam, gdzie to jawna logika
// biznesowa, a to, co faktycznie wyleci z `await prisma...`, i tak trafia
// tutaj.
const fromPrismaError = (error: Prisma.PrismaClientKnownRequestError): AppError | null => {
  switch (error.code) {
    case "P2025": // "Record to update/delete does not exist"
      return new AppError("Nie znaleziono zasobu", 404);
    case "P2002": // unique constraint
      return new AppError("Zasób o tych danych już istnieje", 409);
    case "P2003": // foreign key constraint
      return new AppError("Powiązany zasób nie istnieje", 404);
    default:
      return null;
  }
};

// JEDYNE miejsce w aplikacji, które przy błędzie pisze do response. 4
// argumenty to dla Expressa (4) jedyny sygnał "to jest error handler, nie
// zwykły middleware" — liczba parametrów ma tu znaczenie, nie tylko typy.
// Musi być zarejestrowany jako OSTATNI middleware w index.ts: Express
// przechodzi tu przez next(error) z dowolnego miejsca wcześniej w łańcuchu
// (routy przez asyncHandler, middleware jak requireAdmin/validateBody).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  // Multer rzuca WŁASNĄ klasę błędu (nie AppError) dla np. przekroczonego
  // limitu rozmiaru pliku — fileFilter (lib/uploads.ts) rzuca BadRequestError
  // sam, więc trafia już w gałąź wyżej; to tutaj łapie to, co leci z
  // multera samego (limity, zbyt wiele plików naraz).
  if (error instanceof MulterError) {
    res.status(400).json({ error: `Błąd wgrywania pliku: ${error.message}` });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrismaError(error);
    if (mapped) {
      res.status(mapped.statusCode).json({ error: mapped.message });
      return;
    }
  }

  // Cokolwiek innego — bug, awaria bazy, literówka — to NIE jest
  // oczekiwany, operacyjny błąd. Logujemy pełny obiekt (stack trace) i
  // oddajemy generyczną wiadomość, żeby nie wyciekły szczegóły implementacji.
  console.error(error);
  res.status(500).json({ error: "Wewnętrzny błąd serwera" });
};
