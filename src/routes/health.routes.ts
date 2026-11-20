import { Router } from "express";
import prisma from "../db";
import logger from "../lib/logger";

const healthRoutes = Router();

// Ile czekamy na bazę, zanim uznamy ją za niedostępną. Krócej niż timeout
// HEALTHCHECK-a w Dockerfile.prod (5 s), żeby Docker dostał czytelne 503,
// a nie przerwane w połowie połączenie.
const DB_TIMEOUT_MS = 2000;

// GET /health — sprawdza, czy aplikacja NAPRAWDĘ działa, a nie tylko czy
// proces żyje: bez połączenia z bazą każdy endpoint i tak by padł, więc
// "zdrowy" znaczy "odpowiada i dogada się z Postgresem". Pytają o to Docker
// (HEALTHCHECK) i skrypt deployu, który czeka na status healthy.
// Celowo bez szczegółów błędu w odpowiedzi — endpoint jest publiczny.
healthRoutes.get("/health", async (_req, res) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("database timeout")), DB_TIMEOUT_MS);
      }),
    ]);
    res.status(200).json({ status: "ok", database: "up" });
  } catch (error) {
    logger.error({ err: error }, "Health check: baza niedostępna");
    res.status(503).json({ status: "error", database: "down" });
  } finally {
    // Docker pyta co kilka sekund — bez tego każdy udany check zostawiałby
    // po sobie wiszący timer
    clearTimeout(timer);
  }
});

export default healthRoutes;
