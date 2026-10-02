import { Router } from "express";
import ChildController from "../controllers/childController";
import { requireCurrentUser } from "../middleware/currentUser";

const childRoutes = Router();
const childController = new ChildController();

// "moje dzieci" — GET wymaga logowania i jest zawsze przefiltrowane do
// req.currentUserId (w kontrolerze), nie tylko dostępne dla zalogowanych.
// Tworzenie — jak dotąd — autor zawsze z req.currentUserId, nigdy z body.
childRoutes.get("/children", requireCurrentUser, childController.getIndex);
childRoutes.post("/children", requireCurrentUser, childController.create);

export default childRoutes;
