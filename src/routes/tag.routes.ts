import { Router } from "express";
import TagController from "../controllers/tagController";
import { requireCurrentUser } from "../middleware/currentUser";

const tagRoutes = Router();
const tagController = new TagController();

// GET jest publiczne — niezalogowany też przegląda tagi.
// Zapis wymaga logowania, ale BEZ sprawdzania "własności" tagu — to
// wspólny słownik, każdy zalogowany user może go edytować/kasować.
tagRoutes.get("/tags", tagController.getIndex);
tagRoutes.post("/tags", requireCurrentUser, tagController.createTag);
tagRoutes.get("/tags/:id", tagController.getById);
tagRoutes.put("/tags/:id", requireCurrentUser, tagController.updateTag);
tagRoutes.delete("/tags/:id", requireCurrentUser, tagController.deleteTag);

export default tagRoutes;
