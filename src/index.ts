// dotenv jako PIERWSZY import: db.ts i lib/jwt.ts czytają zmienne
// środowiskowe już przy imporcie, więc .env musi być wczytany wcześniej
import "dotenv/config";
import app from "./app";

// Konfigurowalny port — żeby dało się odpalić kilka branchy naraz (np.
// przez git worktree) obok siebie, każdy na swoim porcie, bez edycji kodu.
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
