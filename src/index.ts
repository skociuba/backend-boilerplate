import "dotenv/config";
import express from "express";
import userRoutes from "./routes/user.routes";
import postRoutes from "./routes/post.routes";
import tagRoutes from "./routes/tag.routes";
import userProfileRoutes from "./routes/userProfile.routes";
import { attachCurrentUser } from "./middleware/currentUser";

const app = express();
const port = 3000;

app.use(express.json());
app.use(attachCurrentUser);

app.use(userRoutes);
app.use(postRoutes);
app.use(tagRoutes);
app.use(userProfileRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
