import { Router } from "express";
import ChildController from "../controllers/childController";
import { requireCurrentUser } from "../middleware/currentUser";

const childRoutes = Router();
const childController = new ChildController();

// GET publiczne (jak posty) — listing z paginacją/sortowaniem/filtrowaniem
// nie wymaga logowania. Tworzenie — jak posty — wymaga bycia zalogowanym,
// autor (user_id) zawsze z req.currentUserId, nigdy z body.
childRoutes.get("/children", childController.getIndex);
childRoutes.post("/children", requireCurrentUser, childController.create);

export default childRoutes;
