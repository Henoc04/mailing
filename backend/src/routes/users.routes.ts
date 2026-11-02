import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/requireRole.middleware";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", usersController.list);
router.post("/", usersController.create);
router.patch("/:id", usersController.setActive);

export default router;
