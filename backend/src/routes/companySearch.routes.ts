import { Router } from "express";
import * as companySearchController from "../controllers/companySearch.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { companySearchSchema, guessEmailSchema } from "../dto/companySearch.dto";

const router = Router();

router.use(requireAuth);

router.post("/search", validate(companySearchSchema), companySearchController.search);
router.post("/guess-email", validate(guessEmailSchema), companySearchController.guessEmail);

export default router;
