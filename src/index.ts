// dotenv jako PIERWSZY import: db.ts i lib/jwt.ts czytają zmienne
// środowiskowe już przy imporcie, więc .env musi być wczytany wcześniej
import "dotenv/config";
// Zaraz po dotenv (potrzebuje SENTRY_DSN), przed aplikacją
import "./instrument";
import app from "./app";
import prisma from "./db";
import logger from "./lib/logger";

// Konfigurowalny port — żeby dało się odpalić kilka branchy naraz (np.
// przez git worktree) obok siebie, każdy na swoim porcie, bez edycji kodu.
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const server = app.listen(port, () => {
  logger.info({ port }, "Serwer działa");
});

// Graceful shutdown. Node jako PID 1 w kontenerze nie ma domyślnej obsługi
// SIGTERM, więc `docker stop` (każdy deploy robi down) czekał 10 s i
// zabijał proces SIGKILL-em w połowie requestów. Teraz serwer przestaje
// przyjmować nowe połączenia, kończy rozpoczęte i zamyka pulę do bazy.
// Timer awaryjny: zawieszone połączenie (np. keep-alive) nie może
// zablokować zamknięcia — lepiej wyjść niż dostać SIGKILL.
function shutdown(signal: string) {
  logger.info({ signal }, "Zamykanie serwera");
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Bez tego bezczynne połączenia keep-alive trzymałyby server.close()
  // aż do timera awaryjnego
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
