import { Request, Response, NextFunction, RequestHandler } from "express";

// Express 4 NIE łapie odrzuconych Promise'ów z async handlerów samo z siebie
// (dopiero Express 5 to robi domyślnie) — bez tego wrappera, błąd rzucony
// po jakimś `await` w kontrolerze zawisałby jako unhandled rejection,
// nigdy nie docierając do errorHandlera. Owijamy raz, tutaj, zamiast pisać
// try { ... } catch (error) { next(error) } w każdej metodzie kontrolera.
// Zwraca Promise ze środka (nie zamyka go w {} bez return) — Express i tak
// go ignoruje (middleware zgłasza zakończenie przez next(), nie przez
// return), ale dzięki temu testy mogą zrobić `await controller.metoda(...)`
// i mieć pewność, że handler faktycznie skończył, zanim sprawdzą asercje.
export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ): RequestHandler =>
  (req, res, next) =>
    fn(req, res, next).catch(next);
