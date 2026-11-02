import { Router } from "express";
import * as campaignsController from "../controllers/campaigns.controller";
import * as sendingController from "../controllers/sending.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { uploadAttachments } from "../middleware/upload.middleware";
import { createCampaignSchema, previewRecipientsSchema, updateCampaignSchema } from "../dto/campaign.dto";

// All /campaigns/:id/(start|pause|resume|cancel|progress) sending-control
// routes live in this file (backed by sending.controller.ts) rather than a
// separate sending.routes.ts, since every one of them is a sub-resource of
// /campaigns/:id and keeping them together avoids a second router that
// would need to be mounted at the exact same path prefix.

const router = Router();

router.use(requireAuth);

router.get("/", campaignsController.list);
router.get("/:id", campaignsController.getOne);
router.post("/", validate(createCampaignSchema), campaignsController.create);
router.post("/preview-recipients", validate(previewRecipientsSchema), campaignsController.previewRecipients);
router.put("/:id", validate(updateCampaignSchema), campaignsController.update);
router.delete("/:id", campaignsController.remove);
router.post("/:id/duplicate", campaignsController.duplicate);

router.post("/:id/resolve", campaignsController.resolveRecipients);
router.post("/:id/preview", campaignsController.preview);

router.post("/:id/attachments", uploadAttachments, campaignsController.uploadAttachments);
router.delete("/:id/attachments/:attachmentId", campaignsController.removeAttachment);

router.post("/:id/start", sendingController.start);
router.post("/:id/pause", sendingController.pause);
router.post("/:id/resume", sendingController.resume);
router.post("/:id/cancel", sendingController.cancel);
router.get("/:id/progress", sendingController.progress);

export default router;
