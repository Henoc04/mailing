import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as trackingService from "../services/tracking.service";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * 1x1 fully-transparent PNG, base64-encoded. Served for every open-pixel
 * request regardless of whether the tracking token was valid, so a
 * recipient's mail client never renders a broken image.
 */
const TRANSPARENT_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

function sendPixel(res: Response): void {
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "no-store");
  // Helmet's default (same-origin) makes browsers refuse to display the
  // pixel inside webmail pages (Outlook.com...), so the open is never seen.
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.status(200).send(TRANSPARENT_PIXEL_PNG);
}

/**
 * GET /t/o/:token — the route pattern is registered as `/t/o/:token` and
 * matches requests like `/t/o/abc123.png`; Express includes the trailing
 * `.png` as part of the `:token` param when the route is declared with an
 * explicit extension placeholder (see tracking.routes.ts), so we strip a
 * trailing ".png" here defensively regardless of how the route matched it.
 */
export const openPixel = asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token.replace(/\.png$/i, "");

  try {
    await trackingService.recordOpen(token, {
      userAgent: req.get("user-agent") ?? undefined,
      ipAddress: req.ip,
    });
  } catch (err) {
    // A tracking failure must never surface as a broken image.
    logger.warn({ err, token }, "openPixel: recordOpen failed, still serving pixel");
  }

  sendPixel(res);
});

/**
 * GET /t/c/:token?u=<encoded original url> — records the click then
 * redirects. On any failure, falls back to redirecting to the app's public
 * base URL rather than showing a 500 page to an email recipient.
 */
export const clickRedirect = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const rawUrl = req.query.u;

  try {
    const targetUrl = typeof rawUrl === "string" ? decodeURIComponent(rawUrl) : "";

    const signature = typeof req.query.s === "string" ? req.query.s : undefined;
    const resolvedUrl = await trackingService.recordClick(token, targetUrl, signature, {
      userAgent: req.get("user-agent") ?? undefined,
      ipAddress: req.ip,
    });

    res.redirect(302, resolvedUrl);
  } catch (err) {
    logger.warn({ err, token }, "clickRedirect: recordClick failed, falling back to public base URL");
    res.redirect(302, env.PUBLIC_BASE_URL);
  }
});
