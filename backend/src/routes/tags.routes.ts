import { Router } from "express";
import * as tagsController from "../controllers/tags.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.get("/", tagsController.list);
router.post("/", tagsController.create);
router.delete("/:id", tagsController.remove);

export default router;
