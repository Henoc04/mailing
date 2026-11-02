import { Router } from "express";
import * as draftsController from "../controllers/drafts.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.get("/", draftsController.list);

export default router;
