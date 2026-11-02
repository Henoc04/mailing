import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { authRateLimiter } from "../middleware/rateLimit.middleware";
import { loginSchema } from "../dto/auth.dto";

const router = Router();

router.post("/login", authRateLimiter, validate(loginSchema), authController.login);
router.get("/me", requireAuth, authController.me);

export default router;
