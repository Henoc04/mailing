import { Router } from "express";
import * as smtpAccountsController from "../controllers/smtpAccounts.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSmtpAccountSchema, updateSmtpAccountSchema } from "../dto/smtpAccount.dto";

const router = Router();

router.use(requireAuth);

router.get("/", smtpAccountsController.list);
router.get("/:id", smtpAccountsController.getOne);
router.post("/", validate(createSmtpAccountSchema), smtpAccountsController.create);
router.put("/:id", validate(updateSmtpAccountSchema), smtpAccountsController.update);
router.delete("/:id", smtpAccountsController.remove);
router.post("/:id/test", smtpAccountsController.testConnection);

export default router;
