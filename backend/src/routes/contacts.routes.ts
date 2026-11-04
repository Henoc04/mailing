import { Router } from "express";
import * as contactsController from "../controllers/contacts.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { bulkDeleteSchema, bulkTagActionSchema, createContactSchema, listContactsQuerySchema, updateContactSchema } from "../dto/contact.dto";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listContactsQuerySchema, "query"), contactsController.list);
router.post("/bulk-tag", validate(bulkTagActionSchema), contactsController.bulkTag);
router.post("/bulk-delete", validate(bulkDeleteSchema), contactsController.bulkDelete);
router.get("/:id", contactsController.getOne);
router.post("/", validate(createContactSchema), contactsController.create);
router.put("/:id", validate(updateContactSchema), contactsController.update);
router.delete("/:id", contactsController.remove);
router.put("/:id/tags", contactsController.setTags);

export default router;
