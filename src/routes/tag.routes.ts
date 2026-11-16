import { Router } from "express";
import TagController from "../controllers/tagController";
import { requireCurrentUser } from "../middleware/currentUser";

const tagRoutes = Router();
const tagController = new TagController();

// Tagi to wspólny słownik — nie są niczyje, więc GET nie filtruje po
// user_id (w odróżnieniu od /children). Sama lista jest publiczna: publiczny
// feed (GET /posts) i tak pokazuje nazwy tagów przy każdym poście, a filtr
// po tagu na stronie głównej musi działać też dla gościa. Zapis i szczegóły
// tagu wymagają logowania, bez sprawdzania "własności" — każdy zalogowany
// user może edytować/kasować.
tagRoutes.get("/tags", tagController.getIndex);
tagRoutes.post("/tags", requireCurrentUser, tagController.createTag);
tagRoutes.get("/tags/:id", requireCurrentUser, tagController.getById);
tagRoutes.put("/tags/:id", requireCurrentUser, tagController.updateTag);
tagRoutes.delete("/tags/:id", requireCurrentUser, tagController.deleteTag);

export default tagRoutes;
