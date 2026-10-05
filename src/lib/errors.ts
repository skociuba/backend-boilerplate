// Błędy OPERACYJNE — oczekiwane sytuacje biznesowe (nie znaleziono, brak
// uprawnień, zły input), w odróżnieniu od błędów programistycznych (bug,
// literówka) czy awarii infrastruktury (baza nie odpowiada). Kontrolery
// RZUCAJĄ jeden z tych typów (throw / next(new ...)) zamiast budować
// res.status(...).json(...) ręcznie w każdym catch — jedyne miejsce, które
// faktycznie pisze do response przy błędzie, to middleware/errorHandler.ts.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Nieprawidłowe dane", details?: unknown) {
    super(message, 400, details);
  }
}

// Autentykacja: "nie wiem kim jesteś".
export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, 401);
  }
}

// Autoryzacja: "wiem kim jesteś, ale nie wolno Ci tego".
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

// Konflikt z istniejącym stanem — zajęty email, zajęta nazwa tagu itd.
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}
