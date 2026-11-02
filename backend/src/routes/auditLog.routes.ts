import { Router } from "express";
import * as auditLogController from "../controllers/auditLog.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/requireRole.middleware";

const router = Router();

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", auditLogController.list);

export default router;
