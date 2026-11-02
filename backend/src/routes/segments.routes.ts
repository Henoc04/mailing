import { Router } from "express";
import * as segmentsController from "../controllers/segments.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSegmentSchema, updateSegmentSchema } from "../dto/segment.dto";

const router = Router();

router.use(requireAuth);

router.get("/", segmentsController.list);
router.get("/:id", segmentsController.getOne);
router.post("/", validate(createSegmentSchema), segmentsController.create);
router.put("/:id", validate(updateSegmentSchema), segmentsController.update);
router.delete("/:id", segmentsController.remove);

export default router;
