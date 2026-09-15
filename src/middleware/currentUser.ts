import { Request, Response, NextFunction } from "express";

// TYMCZASOWE zastępstwo prawdziwej autentykacji (krok "logowanie" w kursie).
// Zamiast dekodować sesję/JWT, czytamy nagłówek x-user-id wysyłany wprost
// przez klienta — frontend ma prosty przełącznik "zalogowany jako X", który
// go ustawia.
//
// Cel tego pliku: mieć już GOTOWĄ logikę autoryzacji (kto może edytować co)
// w kontrolerach, operującą na req.currentUserId. Gdy dojdzie prawdziwe
// logowanie, podmieniamy WYŁĄCZNIE ten plik (attachCurrentUser zacznie
// dekodować token zamiast czytać nagłówek) — kontrolery, routy i frontend
// (poza samym ekranem logowania) zostają bez zmian.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUserId?: number;
    }
  }
}

export const attachCurrentUser = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const header = req.header("x-user-id");
  const parsed = header ? parseInt(header, 10) : NaN;
  req.currentUserId = Number.isNaN(parsed) ? undefined : parsed;
  next();
};

export const requireCurrentUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.currentUserId) {
    res.status(401).json({
      error: "Not authenticated",
      message:
        "Musisz być zalogowany, żeby to zrobić (nagłówek x-user-id — tymczasowy zamiennik prawdziwego logowania).",
    });
    return;
  }
  next();
};
