// Sama konfiguracja aplikacji, bez app.listen — testy integracyjne
// (src/tests/integration) stawiają ją na losowym porcie obok prawdziwej
// bazy, a produkcyjny start jest w index.ts.
import express from "express";
import cookieParser from "cookie-parser";
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

ensureUploadDirs();

// Przed resztą middleware'ów: Docker pyta o /health co kilka sekund, nie ma
// sensu za każdym razem parsować body, ciastek i tokenu
app.use(healthRoutes);

app.use(express.json());
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
