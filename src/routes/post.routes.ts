import { Router } from "express";
import PostController from "../controllers/postController";
import { requireCurrentUser } from "../middleware/currentUser";

const postRoutes = Router();
const postController = new PostController();

postRoutes.get("/posts", postController.getIndex);
postRoutes.post("/posts", requireCurrentUser, postController.createPost);
postRoutes.get("/posts/:id", postController.getById);
postRoutes.put("/posts/:id", requireCurrentUser, postController.updatePost);
postRoutes.delete(
  "/posts/:id",
  requireCurrentUser,
  postController.deletePost
);

// relacja N:M post <-> tag — jeden PUT ustawiający cały zestaw naraz
// (pasuje do multi-selecta z checkboxami). Tagowanie własnego posta wymaga
// logowania; sprawdzenie "czy to Twój post" jest w kontrolerze.
postRoutes.put(
  "/posts/:id/tags",
  requireCurrentUser,
  postController.setTags
);

// strona "N" relacji 1:N widziana od usera — "moje posty", więc wymaga
// logowania (patrz komentarz przy getByUserId)
postRoutes.get(
  "/users/:id/posts",
  requireCurrentUser,
  postController.getByUserId
);

export default postRoutes;
