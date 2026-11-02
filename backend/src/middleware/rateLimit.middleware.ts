import rateLimit from "express-rate-limit";

/**
 * Global limiter applied to all `/api` routes: generous enough for normal
 * usage while blunting brute-force/scraping abuse.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, error: "TooManyRequests", message: "Too many requests, please try again later" },
});

/**
 * Stricter limiter applied specifically to `/api/auth/login` to slow down
 * credential-stuffing / brute-force attempts.
 */
export const authRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, error: "TooManyRequests", message: "Too many login attempts, please try again later" },
});

/**
 * Lenient limiter for public tracking pixel/click routes. These are hit by
 * legitimate mail clients pre-fetching images, so the limit is generous per
 * IP but still bounds abuse (e.g. a single client hammering the endpoint).
 */
export const trackingRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, error: "TooManyRequests", message: "Too many requests" },
});
