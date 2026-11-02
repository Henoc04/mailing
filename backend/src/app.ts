import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { httpLogger } from "./lib/logger";
import { apiRateLimiter } from "./middleware/rateLimit.middleware";
import { notFound } from "./middleware/notFound.middleware";
import { errorHandler } from "./middleware/errorHandler.middleware";
import apiRoutes from "./routes/index";
import trackingRoutes from "./routes/tracking.routes";
import unsubscribeRoutes from "./routes/unsubscribe.routes";
import { TEMPLATE_IMAGES_DIR } from "./middleware/upload.middleware";

export const app: Express = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(httpLogger);

// Public tracking pixel/click routes, mounted at the root path (NOT under
// /api, NOT behind requireAuth or apiRateLimiter) so open-pixel/click URLs
// embedded in outgoing emails stay short: PUBLIC_BASE_URL + "/t/o/:token".
app.use("/t", trackingRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Public, unauthenticated: images uploaded into templates are embedded in
// outgoing emails and must be loadable by any mail client. Served under
// /api so the production reverse proxy (which already forwards /api) reaches
// it. Helmet's default Cross-Origin-Resource-Policy (same-origin) would block
// webmail clients from displaying them, hence the override.
app.use(
  "/api/template-images",
  express.static(TEMPLATE_IMAGES_DIR, {
    maxAge: "30d",
    setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  })
);

// Public unsubscribe page/one-click endpoint (no auth: opened by email
// recipients and by Gmail/Yahoo's servers). Mounted before the /api router
// so requireAuth-protected routes never see it.
app.use("/api/unsubscribe", unsubscribeRoutes);

app.use("/api", apiRateLimiter, apiRoutes);

app.use(notFound);
app.use(errorHandler);
