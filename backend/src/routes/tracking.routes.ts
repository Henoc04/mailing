import { Router } from "express";
import * as trackingController from "../controllers/tracking.controller";
import { trackingRateLimiter } from "../middleware/rateLimit.middleware";

// PUBLIC router — mounted directly on the app at the root path (NOT under
// /api, NOT behind requireAuth) so pixel/click URLs embedded in outgoing
// emails stay short: `${PUBLIC_BASE_URL}/t/o/:token`, `/t/o/:token`.
//
// The open-pixel route is declared as "/o/:token" (no separate extension
// param) — email templates render it as `/t/o/<token>.png`, and the
// controller strips a trailing ".png" from `req.params.token` itself, since
// Express matches ":token" greedily up to the next literal path segment and
// there is none here, so the ".png" suffix is included in the param as-is.

const router = Router();

router.get("/o/:token", trackingRateLimiter, trackingController.openPixel);
router.get("/c/:token", trackingRateLimiter, trackingController.clickRedirect);

export default router;
