import pino from "pino";

// Jeden logger dla całej aplikacji zamiast console.log. Na produkcji każda
// linia to JSON (czas, poziom, wiadomość, kontekst), więc da się ją
// przefiltrować, np. `docker compose logs app | grep '"level":50'`
// (same błędy), zamiast przewijać zlepek tekstu. Lokalnie pino-pretty
// zamienia to na czytelne, kolorowe linie.
//
// LOG_LEVEL: debug | info (domyślnie) | warn | error. W testach "silent",
// żeby wynik jesta nie tonął w logach żądań.
const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  // pino-pretty to devDependency — w obrazie produkcyjnym go nie ma, więc
  // włączamy go tylko poza produkcją
  ...(isProduction || isTest
    ? {}
    : { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } } }),
});

export default logger;
