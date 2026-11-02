import { Router } from "express";
import * as contactImportController from "../controllers/contactImport.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadContactImport } from "../middleware/upload.middleware";

// Mounted at /api/contact-imports in routes/index.ts (a distinct path from
// /api/contacts) so Express never has to disambiguate this router's
// "/preview" and "/confirm" paths against the generic /contacts/:id route.

const router = Router();

router.use(requireAuth);

router.post("/preview", uploadContactImport, contactImportController.preview);
router.post("/confirm", contactImportController.confirm);

export default router;
