import { Router } from "express";
import TagController from "../controllers/tagController";
import { requireCurrentUser } from "../middleware/currentUser";

const tagRoutes = Router();
const tagController = new TagController();

// Tagi to wspólny słownik — nie są niczyje, więc GET nie filtruje po
// user_id (w odróżnieniu od /children). Ale wymaga logowania: to zasób
// dla KAŻDEGO zalogowanego, nie dla świata. Zapis też bez sprawdzania
// "własności" — każdy zalogowany user może edytować/kasować.
tagRoutes.get("/tags", requireCurrentUser, tagController.getIndex);
tagRoutes.post("/tags", requireCurrentUser, tagController.createTag);
tagRoutes.get("/tags/:id", requireCurrentUser, tagController.getById);
tagRoutes.put("/tags/:id", requireCurrentUser, tagController.updateTag);
tagRoutes.delete("/tags/:id", requireCurrentUser, tagController.deleteTag);

export default tagRoutes;
