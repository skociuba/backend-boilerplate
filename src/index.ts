import "dotenv/config";
import express from "express";
import userRoutes from "./routes/user.routes";
import postRoutes from "./routes/post.routes";
import tagRoutes from "./routes/tag.routes";
import userProfileRoutes from "./routes/userProfile.routes";
import { attachCurrentUser } from "./middleware/currentUser";

const app = express();
// Konfigurowalny port — żeby dało się odpalić kilka branchy naraz (np.
// przez git worktree) obok siebie, każdy na swoim porcie, bez edycji kodu.
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());
app.use(attachCurrentUser);

app.use(userRoutes);
app.use(postRoutes);
app.use(tagRoutes);
app.use(userProfileRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
