// Sama konfiguracja aplikacji, bez app.listen — testy integracyjne
// (src/tests/integration) stawiają ją na losowym porcie obok prawdziwej
// bazy, a produkcyjny start jest w index.ts.
import { randomUUID } from "node:crypto";
import express from "express";
import pinoHttp from "pino-http";
import logger from "./lib/logger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import userRoutes from "./routes/user.routes";
import postRoutes from "./routes/post.routes";
import tagRoutes from "./routes/tag.routes";
import userProfileRoutes from "./routes/userProfile.routes";
import childRoutes from "./routes/child.routes";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import { attachCurrentUser } from "./middleware/currentUser";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { AVATARS_DIR, POST_IMAGES_DIR, ensureUploadDirs } from "./lib/uploads";

const app = express();

// Produkcja stoi za nginxem — bez tego req.ip to ZAWSZE adres samego
// proxy (ten sam dla każdego klienta), więc loginRateLimiter (index po IP)
// wrzucałby wszystkich użytkowników do jednego wspólnego licznika. "1"
// znaczy "ufaj jednemu hopowi proxy przed appką" — tyle ile nginx tu robi,
// nie więcej (ufanie NIEOKREŚLONEJ liczbie hopów pozwoliłoby każdemu
// podszyć się pod dowolne IP przez nagłówek X-Forwarded-For).
app.set("trust proxy", 1);

// Nagłówki bezpieczeństwa dla każdej odpowiedzi (także /health i plików z
// /uploads): nosniff, zakaz osadzania w ramce, restrykcyjna CSP, CORP
// same-origin — frontend i tak pobiera pliki przez własny /api-proxy, więc
// dla przeglądarki to ten sam origin. Usuwa też X-Powered-By: Express, które
// zdradzało, na czym stoi API.
// HSTS wyłączony tutaj, bo ustawia go nginx dla całej domeny (to on
// obsługuje HTTPS) — dwa takie same nagłówki z dwóch warstw to bałagan.
app.use(helmet({ strictTransportSecurity: false }));

ensureUploadDirs();

// Przed resztą middleware'ów: Docker pyta o /health co kilka sekund, nie ma
// sensu za każdym razem parsować body, ciastek i tokenu
app.use(healthRoutes);

// Jedna linia logu na żądanie: metoda, ścieżka, status, czas. Za healthRoutes,
// żeby nie zalewać logów pytaniami Dockera co kilka sekund.
app.use(
  pinoHttp({
    logger,
    // ID żądania: z nagłówka X-Request-Id (jeśli ustawi go proxy), inaczej
    // nowy UUID. Odsyłany w odpowiedzi — użytkownik zgłaszający błąd może
    // go podać i od razu widać w logach, o które żądanie chodzi.
    genReqId: (req, res) => {
      const id = req.headers["x-request-id"]?.toString() || randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    // 5xx jako error, 4xx jako warn — błędy da się odfiltrować po poziomie
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    // Tokeny i ciastka sesji nie mogą lądować w logach
    redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
  })
);

app.use(express.json());
// Express 5 zostawia req.body = undefined, gdy żądanie nie ma body albo ma
// inny Content-Type (w 4.x zawsze było {}). Kontrolery robią
// `const { name } = req.body` i bez tego żądanie bez body kończyło się
// 500 zamiast normalnej walidacji. Multer (uploady) ustawia body sam,
// później, więc go to nie dotyczy.
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
// req.cookies — potrzebne przed attachCurrentUser/authRoutes, bo refresh
// token teraz przyjeżdża jako httpOnly cookie, nie w body
app.use(cookieParser());
app.use(attachCurrentUser);

// Avatary są PUBLICZNE (zdjęcia, nie dane prywatne) — serwowane bez
// żadnej autoryzacji, prosto z dysku. Dokumenty NIE są tu wystawione —
// mają własny, chroniony endpoint (GET /users/:id/profile/document
// w userProfile.routes.ts), bo w odróżnieniu od avatara mogą być prywatne.
app.use("/uploads/avatars", express.static(AVATARS_DIR));
// Zdjęcia postów jw. — posty są publiczne, więc ich zdjęcia też.
app.use("/uploads/posts", express.static(POST_IMAGES_DIR));

app.use(authRoutes);
app.use(userRoutes);
app.use(postRoutes);
app.use(tagRoutes);
app.use(userProfileRoutes);
app.use(childRoutes);

// Oba MUSZĄ stać na samym końcu łańcucha — Express dochodzi tu tylko jeśli
// żaden wcześniejszy route nie pasował (notFoundHandler) albo ktoś wcześniej
// zawołał next(error) (errorHandler, rozpoznawany przez Express po liczbie
// argumentów: 4, nie 3). Kolejność WZGLĘDEM SIEBIE też ma znaczenie:
// notFoundHandler pierwszy, żeby zdążył obsłużyć nietrafiony route, zanim
// cokolwiek zdąży rzucić błąd.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
