import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.routes";
import postRoutes from "./routes/post.routes";
import tagRoutes from "./routes/tag.routes";
import userProfileRoutes from "./routes/userProfile.routes";
import childRoutes from "./routes/child.routes";
import authRoutes from "./routes/auth.routes";
import { attachCurrentUser } from "./middleware/currentUser";

const app = express();
// Konfigurowalny port — żeby dało się odpalić kilka branchy naraz (np.
// przez git worktree) obok siebie, każdy na swoim porcie, bez edycji kodu.
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Produkcja stoi za nginxem — bez tego req.ip to ZAWSZE adres samego
// proxy (ten sam dla każdego klienta), więc loginRateLimiter (index po IP)
// wrzucałby wszystkich użytkowników do jednego wspólnego licznika. "1"
// znaczy "ufaj jednemu hopowi proxy przed appką" — tyle ile nginx tu robi,
// nie więcej (ufanie NIEOKREŚLONEJ liczbie hopów pozwoliłoby każdemu
// podszyć się pod dowolne IP przez nagłówek X-Forwarded-For).
app.set("trust proxy", 1);

app.use(express.json());
// req.cookies — potrzebne przed attachCurrentUser/authRoutes, bo refresh
// token teraz przyjeżdża jako httpOnly cookie, nie w body
app.use(cookieParser());
app.use(attachCurrentUser);

app.use(authRoutes);
app.use(userRoutes);
app.use(postRoutes);
app.use(tagRoutes);
app.use(userProfileRoutes);
app.use(childRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
