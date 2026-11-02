import nodemailer, { type Transporter } from "nodemailer";
import { getDecryptedCredentials } from "./smtpAccount.service";
import { SmtpError } from "../errors/errors";

interface CachedTransporter {
  transporter: Transporter;
  fromEmail: string;
  fromName: string;
  createdAt: number;
}

// Module-level cache so repeated sends from the same SMTP account reuse a
// pooled connection instead of reconnecting on every single email — this is
// the core of "smart sending" performance for high-volume campaigns.
const transporterCache = new Map<string, CachedTransporter>();

const TRANSPORTER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export interface GetTransporterResult {
  transporter: Transporter;
  fromEmail: string;
  fromName: string;
}

/**
 * Returns a pooled nodemailer transporter for the given SMTP account,
 * reusing a cached one if it exists and is younger than
 * `TRANSPORTER_MAX_AGE_MS`. Otherwise fetches decrypted credentials, builds
 * a fresh pooled transporter, caches it, and returns it.
 */
export async function getTransporter(smtpAccountId: string): Promise<GetTransporterResult> {
  const cached = transporterCache.get(smtpAccountId);
  if (cached && Date.now() - cached.createdAt < TRANSPORTER_MAX_AGE_MS) {
    return { transporter: cached.transporter, fromEmail: cached.fromEmail, fromName: cached.fromName };
  }

  const credentials = await getDecryptedCredentials(smtpAccountId);

  const transporter = nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.security === "SSL",
    auth: {
      user: credentials.username,
      pass: credentials.password,
    },
    pool: true,
    maxConnections: 3,
    ...(credentials.security === "STARTTLS" ? { requireTLS: true } : {}),
  });

  transporterCache.set(smtpAccountId, {
    transporter,
    fromEmail: credentials.fromEmail,
    fromName: credentials.fromName,
    createdAt: Date.now(),
  });

  return { transporter, fromEmail: credentials.fromEmail, fromName: credentials.fromName };
}

/**
 * Drops a cached transporter (closing its pooled connections) so the next
 * `getTransporter` call rebuilds a fresh one. This IS the "reconnexion
 * SMTP" mechanism: called whenever a send fails with what looks like a
 * connection/auth problem, since a stale pooled socket is a common cause
 * of repeated failures until the pool is torn down and recreated.
 */
export function invalidateTransporter(smtpAccountId: string): void {
  const cached = transporterCache.get(smtpAccountId);
  if (cached) {
    try {
      cached.transporter.close();
    } catch {
      // Best-effort close — the transporter/socket may already be dead.
    }
    transporterCache.delete(smtpAccountId);
  }
}

interface SmtpLikeError {
  code?: string;
  responseCode?: number;
  message?: string;
}

const CONNECTION_ERROR_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EAUTH", "ECONNRESET", "ECONNREFUSED"]);

function looksLikeConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const e = err as SmtpLikeError;
  if (e.code && CONNECTION_ERROR_CODES.has(e.code)) {
    return true;
  }
  if (typeof e.message === "string" && e.message.toLowerCase().includes("connection")) {
    return true;
  }
  return false;
}

export interface SendMailParams {
  smtpAccountId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; path: string }>;
}

export interface SendMailResult {
  messageId: string;
}

/**
 * Sends a single email through the pooled transporter for `smtpAccountId`.
 * On any failure: if the error looks like a connection/auth issue, the
 * cached transporter is invalidated so the next attempt (retry) gets a
 * fresh connection. The original error is always re-thrown wrapped in a
 * single `SmtpError` type so callers (the future sendWorker) only ever need
 * to catch one error class to decide on retry/backoff.
 */
export async function sendMail(params: SendMailParams): Promise<SendMailResult> {
  const { smtpAccountId, to, subject, html, text, headers, attachments } = params;

  const { transporter, fromEmail, fromName } = await getTransporter(smtpAccountId);

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text,
      headers,
      attachments,
    });

    return { messageId: info.messageId };
  } catch (err) {
    if (looksLikeConnectionError(err)) {
      invalidateTransporter(smtpAccountId);
    }

    const message = err instanceof Error ? err.message : "Erreur d'envoi SMTP inconnue";
    const e = (typeof err === "object" && err !== null ? err : {}) as SmtpLikeError & { response?: unknown };
    throw new SmtpError(message, {
      responseCode: typeof e.responseCode === "number" ? e.responseCode : undefined,
      response: typeof e.response === "string" ? e.response : undefined,
    });
  }
}

/**
 * True when the failure proves the address itself is unusable (unknown
 * mailbox, unknown domain) — as opposed to a policy/spam rejection (554),
 * a full mailbox or a transient error. Such contacts must not be mailed
 * again: repeated sends to dead addresses hurt the sender's reputation.
 */
export function isHardBounce(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const e = err as SmtpLikeError & { response?: unknown };
  const response = typeof e.response === "string" ? e.response : "";

  // Enhanced status codes 5.1.x = bad destination mailbox/system address.
  if (/\b5\.1\.\d\b/.test(response)) {
    return true;
  }
  return e.responseCode === 550 || e.responseCode === 551 || e.responseCode === 553
    ? !/\b5\.[27]\.\d\b/.test(response) // 5.2.x mailbox full / 5.7.x policy: not the address's fault
    : false;
}

// SMTP response codes that indicate a transient condition (temporary
// failure, greylisting, throttling, temporary local issue) rather than a
// permanent rejection.
const RETRYABLE_RESPONSE_CODES = new Set([421, 450, 451, 452]);

// SMTP response codes that indicate a permanent/hard rejection (invalid
// recipient, mailbox unavailable, policy rejection) — retrying will not
// help.
const NON_RETRYABLE_RESPONSE_CODES = new Set([550, 551, 553, 554]);

/**
 * Classifies whether a failed send should be retried (with backoff) or
 * marked permanently FAILED. Used by the future sendWorker.
 *
 * Default-safe fallback: when the error carries no recognizable
 * `responseCode` (e.g. a raw connection/timeout error, or something
 * unexpected), we treat it as retryable. It's safer to retry a handful of
 * times too many (bounded by `Campaign.maxRetries`) than to give up on a
 * transient hiccup and silently drop a recipient.
 */
export function isRetryableSmtpError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return true;
  }

  const e = err as SmtpLikeError;

  if (typeof e.responseCode === "number") {
    if (NON_RETRYABLE_RESPONSE_CODES.has(e.responseCode)) {
      return false;
    }
    if (RETRYABLE_RESPONSE_CODES.has(e.responseCode)) {
      return true;
    }
    // Any other 4xx is conventionally transient, any other 5xx permanent.
    if (e.responseCode >= 400 && e.responseCode < 500) {
      return true;
    }
    if (e.responseCode >= 500) {
      return false;
    }
  }

  if (looksLikeConnectionError(err)) {
    return true;
  }

  return true;
}
