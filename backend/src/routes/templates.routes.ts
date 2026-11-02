import { Router } from "express";
import * as templatesController from "../controllers/templates.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { uploadAttachments, uploadTemplateImage } from "../middleware/upload.middleware";
import { createTemplateSchema, updateTemplateSchema } from "../dto/template.dto";

const router = Router();

router.use(requireAuth);

router.get("/", templatesController.list);
router.get("/:id", templatesController.getOne);
router.post("/", validate(createTemplateSchema), templatesController.create);
router.post("/images", uploadTemplateImage, templatesController.uploadImage);
router.put("/:id", validate(updateTemplateSchema), templatesController.update);
router.delete("/:id", templatesController.remove);
router.post("/:id/duplicate", templatesController.duplicate);

router.post("/:id/attachments", uploadAttachments, templatesController.uploadAttachments);
router.delete("/:id/attachments/:attachmentId", templatesController.removeAttachment);

export default router;
