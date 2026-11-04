/**
 * sendWorker.ts — the smart sending engine.
 *
 * ARCHITECTURE: the `CampaignRecipient` table itself IS the queue (no
 * Redis/BullMQ). `getNextDueRecipient()` (see `sendQueue.service.ts`) always
 * returns a SINGLE candidate: the most-overdue PENDING recipient belonging
 * to a SENDING campaign, ordered by `nextAttemptAt`. This file polls that
 * function on a short fixed interval and drives one send per tick when
 * conditions allow.
 *
 * IN-MEMORY STATE (all worker-process-local, lost on restart — acceptable
 * since a restart simply resumes pacing/rate-limiting from a clean slate,
 * which is a safe, conservative failure mode, not a correctness issue: the
 * DB-persisted `CampaignRecipient.nextAttemptAt`/`status` is the actual
 * source of truth for *what* to send, this in-memory state only governs
 * *when/how fast*):
 *
 *   - `rotationIndexByCampaignId: Map<campaignId, number>` — last index
 *     returned by `pickForRotation`, so round-robin rotation continues
 *     correctly across ticks for a given campaign.
 *   - `rateLimitByCampaignId: Map<campaignId, RateLimitState>` — sliding
 *     fixed-window counters (`minuteWindowStart`/`minuteCount`,
 *     `hourWindowStart`/`hourCount`) used to enforce `maxPerMinute` /
 *     `maxPerHour`.
 *   - `nextAllowedSendAtByCampaignId: Map<campaignId, number>` — epoch ms
 *     before which no recipient of this campaign should be sent, used to
 *     enforce `baseDelayMs` + jitter pacing BETWEEN successive sends of the
 *     SAME campaign.
 *
 * WHY THESE MAPS EXIST SEPARATELY FROM `nextAttemptAt`: `nextAttemptAt` on
 * `CampaignRecipient` is only ever pushed forward by `markRecipientFailed`'s
 * retry backoff. It is NOT touched for a fresh PENDING recipient or after a
 * successful send of a sibling recipient, so it cannot by itself express
 * "wait N ms after the last send before sending the next one in this
 * campaign" — that pacing has nowhere to persist to in the schema as
 * written. Hence the local `nextAllowedSendAtByCampaignId` map, updated after
 * every processed recipient (success or terminal/retried failure) for that
 * recipient's campaign.
 *
 * BLOCKED CAMPAIGNS ARE SKIPPED: `getNextDueRecipient()` returns the
 * globally most-overdue PENDING row. If that row's campaign is currently
 * paced-out (`nextAllowedSendAtByCampaignId`) or rate-limited
 * (`rateLimitByCampaignId`), the tick does NOT claim it; it adds that
 * campaign to an exclusion list and asks again, up to
 * `MAX_CANDIDATES_PER_TICK` times. Without this, a long-running campaign
 * with a pacing delay would keep its oldest recipient first in line forever
 * and block every campaign started after it until it finished.
 *
 * PACING/TICK LOOP: implemented as a `setInterval` firing every
 * `TICK_INTERVAL_MS` (300ms), NOT a recursive self-scheduling `setTimeout`.
 * Each tick invokes `processTick()`, which performs AT MOST one send. Actual
 * per-campaign pacing (`baseDelayMs` + jitter) and rate limiting are both
 * enforced by the in-memory maps described above, not by the tick interval
 * itself — the interval is just a short, fixed heartbeat that's fast enough
 * to honor pacing/rate-limit windows fairly precisely without a tight
 * busy-loop. This was chosen over a recursive setTimeout loop because a
 * fixed setInterval more directly matches "poll frequently for ANY
 * campaign's due work" — the delay that matters (per-campaign pacing) is
 * data-dependent (varies per campaign) and does not map cleanly onto "the
 * loop's own delay before its next iteration", which is what a recursive
 * setTimeout would naturally control.
 *
 * ERROR ISOLATION: `processTick()`'s entire body runs inside try/catch, and
 * the `setInterval` callback wraps the call in a `.catch()` as well (belt and
 * suspenders) so no unhandled promise rejection can ever escape a tick and no
 * single tick's exception can stop future ticks from firing.
 */

import type { Campaign, CampaignRecipient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { emitCampaignProgress } from "../lib/socket";
import { env } from "../config/env";
import {
  getNextDueRecipient,
  markRecipientSending,
  markRecipientSent,
  markRecipientFailed,
  markRecipientSkipped,
  releaseRecipient,
  startDueScheduledCampaigns,
} from "../services/sendQueue.service";
import * as campaignService from "../services/campaign.service";
import { SmtpAccountUnusableError } from "../errors/errors";
import { pickForRotation } from "../services/smtpAccount.service";
import { sendMail, isRetryableSmtpError, isHardBounce } from "../services/smtpTransport.service";
import {
  renderCampaignContent,
  injectTracking,
  appendUnsubscribeFooter,
  buildUnsubscribeUrl,
  htmlToText,
} from "../services/mergeEngine.service";

const TICK_INTERVAL_MS = 300;

/** How many blocked campaigns a single tick may skip before giving up. */
const MAX_CANDIDATES_PER_TICK = 20;

// How often to check for SCHEDULED campaigns whose scheduledAt has passed and
// auto-start them. Coarser than TICK_INTERVAL_MS on purpose — schedules are
// only precise to the minute in the UI, so a send starting up to 10s late
// is immaterial, and it keeps this from adding a query to every 300ms tick.
const SCHEDULE_CHECK_INTERVAL_MS = 10_000;

interface RateLimitState {
  minuteWindowStart: number;
  minuteCount: number;
  hourWindowStart: number;
  hourCount: number;
}

// --- module-level in-memory state (see file header for full rationale) ---
const rotationIndexByCampaignId = new Map<string, number>();
const rateLimitByCampaignId = new Map<string, RateLimitState>();
const nextAllowedSendAtByCampaignId = new Map<string, number>();

let tickHandle: ReturnType<typeof setInterval> | null = null;
let scheduleCheckHandle: ReturnType<typeof setInterval> | null = null;

/** random integer in [0, maxExclusive] inclusive of 0, i.e. random(0, jitterMs). */
function randomJitter(jitterMs: number): number {
  if (jitterMs <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * (jitterMs + 1));
}

/**
 * Returns true if `campaignId` currently has room to send under both its
 * `maxPerMinute` and `maxPerHour` limits (either/both may be null, meaning
 * "no limit on that axis"). Lazily initializes/rolls the sliding fixed
 * windows as needed. Does NOT itself increment counts — call
 * `recordSendForRateLimit` after actually sending.
 */
function isRateLimited(campaign: Campaign): boolean {
  if (campaign.maxPerMinute === null && campaign.maxPerHour === null) {
    return false;
  }

  const now = Date.now();
  const state = rateLimitByCampaignId.get(campaign.id);

  if (!state) {
    // No state recorded yet — definitely not rate limited.
    return false;
  }

  if (now - state.minuteWindowStart >= 60_000) {
    // Window has rolled; from the caller's point of view this is "not
    // limited" (the actual reset happens in recordSendForRateLimit/lazily
    // here so reads stay consistent).
    state.minuteWindowStart = now;
    state.minuteCount = 0;
  }
  if (now - state.hourWindowStart >= 3_600_000) {
    state.hourWindowStart = now;
    state.hourCount = 0;
  }

  if (campaign.maxPerMinute !== null && state.minuteCount >= campaign.maxPerMinute) {
    return true;
  }
  if (campaign.maxPerHour !== null && state.hourCount >= campaign.maxPerHour) {
    return true;
  }
  return false;
}

/** Records that a send just happened for `campaignId`, incrementing/rolling windows as needed. */
function recordSendForRateLimit(campaignId: string): void {
  const now = Date.now();
  let state = rateLimitByCampaignId.get(campaignId);

  if (!state) {
    state = { minuteWindowStart: now, minuteCount: 0, hourWindowStart: now, hourCount: 0 };
    rateLimitByCampaignId.set(campaignId, state);
  }

  if (now - state.minuteWindowStart >= 60_000) {
    state.minuteWindowStart = now;
    state.minuteCount = 0;
  }
  if (now - state.hourWindowStart >= 3_600_000) {
    state.hourWindowStart = now;
    state.hourCount = 0;
  }

  state.minuteCount += 1;
  state.hourCount += 1;
}

/** True if `campaignId` has not yet reached its next-allowed-send epoch. */
function isPacedOut(campaignId: string): boolean {
  const nextAllowedAt = nextAllowedSendAtByCampaignId.get(campaignId);
  if (nextAllowedAt === undefined) {
    return false;
  }
  return Date.now() < nextAllowedAt;
}

/** Sets the next-allowed-send epoch for `campaignId` per the campaign's baseDelayMs + jitter. */
function schedulePacingForNextSend(campaign: Campaign): void {
  const delay = campaign.baseDelayMs + randomJitter(campaign.jitterMs);
  nextAllowedSendAtByCampaignId.set(campaign.id, Date.now() + delay);
}

interface CampaignSendContext extends Campaign {
  template: {
    subject: string;
    bodyHtml: string;
    attachments: Array<{ fileName: string; storedPath: string }>;
  } | null;
  smtpAccounts: Array<{ id: string }>;
  attachments: Array<{ fileName: string; storedPath: string }>;
}

/** Loads everything the worker needs about a campaign beyond the bare `Campaign` row. */
async function loadCampaignSendContext(campaignId: string): Promise<CampaignSendContext | null> {
  return prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: {
        select: {
          subject: true,
          bodyHtml: true,
          attachments: { select: { fileName: true, storedPath: true } },
        },
      },
      smtpAccounts: { select: { id: true } },
      attachments: { select: { fileName: true, storedPath: true } },
    },
  });
}

/** Fetches the latest campaign counters and emits a progress snapshot over Socket.IO. */
async function emitProgressSnapshot(campaignId: string, campaign: Campaign): Promise<void> {
  const counters = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      status: true,
      sentCount: true,
      failedCount: true,
      openedCount: true,
      clickedCount: true,
      totalRecipients: true,
      pauseReason: true,
    },
  });

  if (!counters) {
    return;
  }

  const processed = counters.sentCount + counters.failedCount;
  const remaining = Math.max(0, counters.totalRecipients - processed);
  const avgDelayMs = campaign.baseDelayMs + campaign.jitterMs / 2;
  const etaSeconds = Math.round((remaining * avgDelayMs) / 1000);

  emitCampaignProgress(campaignId, {
    ...counters,
    remaining,
    etaSeconds,
  });
}

/** Auto-starts every SCHEDULED campaign whose scheduledAt has passed. */
async function processScheduleTick(): Promise<void> {
  try {
    await startDueScheduledCampaigns();
  } catch (err) {
    logger.error({ err }, "sendWorker: error while starting due scheduled campaigns");
  }
}

/**
 * Processes at most one recipient this tick. See file header for the full
 * design rationale around single-candidate polling, pacing, and rate
 * limiting.
 */
async function processTick(): Promise<void> {
  try {
    // Skip campaigns that are paced-out or rate-limited so they don't block
    // the others — see file header "BLOCKED CAMPAIGNS ARE SKIPPED".
    const excludedCampaignIds: string[] = [];
    let dueRecipient: Awaited<ReturnType<typeof getNextDueRecipient>> = null;
    for (let i = 0; i < MAX_CANDIDATES_PER_TICK; i++) {
      const candidate = await getNextDueRecipient(excludedCampaignIds);
      if (!candidate) {
        return;
      }
      if (isPacedOut(candidate.campaign.id) || isRateLimited(candidate.campaign)) {
        excludedCampaignIds.push(candidate.campaign.id);
        continue;
      }
      dueRecipient = candidate;
      break;
    }
    if (!dueRecipient) {
      return;
    }

    const campaign = dueRecipient.campaign;

    await markRecipientSending(dueRecipient.id);

    const sendContext = await loadCampaignSendContext(campaign.id);

    if (!sendContext) {
      // Campaign vanished between getNextDueRecipient() and now — extremely
      // unlikely (no delete-while-sending path exists), but fail safe.
      await markRecipientFailed(dueRecipient.id, {
        errorMessage: "Campagne introuvable au moment de l'envoi",
        retryable: false,
        maxRetries: campaign.maxRetries,
      });
      return;
    }

    if (!sendContext.template) {
      await markRecipientFailed(dueRecipient.id, {
        errorMessage: "Aucun modèle associé à cette campagne",
        retryable: false,
        maxRetries: campaign.maxRetries,
      });
      await emitProgressSnapshot(campaign.id, campaign);
      return;
    }

    await processRecipientSend(dueRecipient, campaign, sendContext);
  } catch (err) {
    // A single tick's exception (e.g. a transient DB connectivity blip)
    // must never crash the process or stop future ticks — setInterval
    // keeps firing regardless; we just log and move on.
    logger.error({ err }, "sendWorker: unexpected error during processTick, will retry next tick");
  }
}

/**
 * Performs the actual render + send + outcome recording for one recipient,
 * given its campaign is confirmed to have a template. Pulled out of
 * `processTick` purely to keep that function's control flow readable.
 */
async function processRecipientSend(
  dueRecipient: CampaignRecipient & { campaign: Campaign },
  campaign: Campaign,
  sendContext: CampaignSendContext
): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: dueRecipient.contactId },
    select: { id: true, email: true, isUnsubscribed: true, bouncedAt: true },
  });

  // The queue is materialized when the campaign starts; a contact may have
  // unsubscribed (or been flagged as a dead address) since then.
  if (contact && (contact.isUnsubscribed || contact.bouncedAt)) {
    await markRecipientSkipped(
      dueRecipient.id,
      contact.isUnsubscribed ? "Contact désinscrit — envoi annulé" : "Adresse invalide (rebond) — envoi annulé"
    );
    await emitProgressSnapshot(campaign.id, campaign);
    return;
  }

  if (!contact) {
    await markRecipientFailed(dueRecipient.id, {
      errorMessage: "Contact introuvable pour ce destinataire",
      retryable: false,
      maxRetries: campaign.maxRetries,
    });
    schedulePacingForNextSend(campaign);
    await emitProgressSnapshot(campaign.id, campaign);
    return;
  }

  const template = sendContext.template;
  if (!template) {
    // Defensive: `processTick` already checked this before calling us, but
    // guard here too rather than asserting the type away, in case this
    // function is ever called from a different path in the future.
    await markRecipientFailed(dueRecipient.id, {
      errorMessage: "Aucun modèle associé à cette campagne",
      retryable: false,
      maxRetries: campaign.maxRetries,
    });
    schedulePacingForNextSend(campaign);
    await emitProgressSnapshot(campaign.id, campaign);
    return;
  }

  const mergeData = dueRecipient.mergeDataJson as Record<string, string>;

  const { subject, bodyHtml: renderedBodyHtml } = renderCampaignContent({
    subjectTemplate: campaign.subjectOverride || template.subject,
    bodyHtmlTemplate: template.bodyHtml,
    mergeData,
  });

  const unsubscribeUrl = buildUnsubscribeUrl(env.PUBLIC_BASE_URL, dueRecipient.trackingToken);
  const bodyHtml = appendUnsubscribeFooter(
    injectTracking({
      bodyHtml: renderedBodyHtml,
      trackingToken: dueRecipient.trackingToken,
      publicBaseUrl: env.PUBLIC_BASE_URL,
    }),
    unsubscribeUrl
  );

  const accountIds = sendContext.smtpAccounts.map((a) => a.id);
  const { accountId: smtpAccountId, nextIndex } = pickForRotation(
    accountIds,
    campaign.useRotation,
    rotationIndexByCampaignId.get(campaign.id)
  );
  rotationIndexByCampaignId.set(campaign.id, nextIndex);

  const attachments = [...(sendContext.template?.attachments ?? []), ...sendContext.attachments].map((a) => ({
    filename: a.fileName,
    path: a.storedPath,
  }));

  const start = Date.now();
  try {
    await sendMail({
      smtpAccountId,
      to: contact.email,
      subject,
      html: bodyHtml,
      text: htmlToText(bodyHtml),
      // RFC 8058 one-click unsubscribe — required by Gmail/Yahoo for bulk senders.
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      attachments,
    });
    const durationMs = Date.now() - start;

    await markRecipientSent(dueRecipient.id, { smtpAccountId, durationMs });
    recordSendForRateLimit(campaign.id);

    logger.info(
      { campaignId: campaign.id, recipientId: dueRecipient.id, smtpAccountId, durationMs },
      "sendWorker: recipient email sent successfully"
    );
  } catch (err) {
    if (err instanceof SmtpAccountUnusableError) {
      // Every recipient would fail the same way: pause the whole campaign
      // with the reason instead of exhausting each recipient's retries.
      await releaseRecipient(dueRecipient.id);
      await campaignService.markStatus(campaign.id, "PAUSED", { pauseReason: err.message });
      logger.warn(
        { campaignId: campaign.id, smtpAccountId, err: err.message },
        "sendWorker: SMTP account unusable, campaign paused"
      );
      await emitProgressSnapshot(campaign.id, campaign);
      return;
    }

    const durationMs = Date.now() - start;
    const retryable = isRetryableSmtpError(err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (isHardBounce(err)) {
      await prisma.contact.update({ where: { id: contact.id }, data: { bouncedAt: new Date() } });
      logger.info({ contactId: contact.id }, "sendWorker: contact flagged as hard bounce, excluded from future sends");
    }

    await markRecipientFailed(dueRecipient.id, {
      errorMessage,
      retryable,
      maxRetries: campaign.maxRetries,
      smtpAccountId,
      durationMs,
    });
    recordSendForRateLimit(campaign.id);

    logger.warn(
      { campaignId: campaign.id, recipientId: dueRecipient.id, smtpAccountId, durationMs, retryable, err: errorMessage },
      "sendWorker: recipient email send failed"
    );
  }

  schedulePacingForNextSend(campaign);
  await emitProgressSnapshot(campaign.id, campaign);
}

/**
 * Starts the recurring tick loop. Safe to call once at process startup
 * (e.g. from `server.ts`). Calling it again while already running is a
 * no-op (logs a warning) rather than creating a second overlapping
 * interval.
 */
export function startSendWorker(): void {
  if (tickHandle !== null) {
    logger.warn("startSendWorker: worker is already running, ignoring duplicate start request");
    return;
  }

  logger.info({ tickIntervalMs: TICK_INTERVAL_MS }, "startSendWorker: starting send worker tick loop");

  tickHandle = setInterval(() => {
    processTick().catch((err) => {
      // Belt-and-suspenders: processTick() already catches internally, but
      // this ensures that even a bug in that catch logic (or something
      // thrown synchronously before the try block) can never produce an
      // unhandled promise rejection that crashes the process or halts
      // future ticks — setInterval keeps firing regardless either way.
      logger.error({ err }, "sendWorker: unexpected error escaped processTick");
    });
  }, TICK_INTERVAL_MS);

  scheduleCheckHandle = setInterval(() => {
    processScheduleTick().catch((err) => {
      logger.error({ err }, "sendWorker: unexpected error escaped processScheduleTick");
    });
  }, SCHEDULE_CHECK_INTERVAL_MS);
}

/**
 * Stops the recurring tick loop (e.g. during graceful shutdown). No-op if
 * the worker isn't currently running. Does not clear in-memory
 * pacing/rate-limit/rotation state — a subsequent `startSendWorker()` call
 * within the same process will simply resume from where it left off, which
 * is harmless (rate limits and pacing are conservative-by-construction: at
 * worst they cause an extra brief wait, never an over-send).
 */
export function stopSendWorker(): void {
  if (tickHandle === null) {
    logger.warn("stopSendWorker: worker is not running, nothing to stop");
    return;
  }

  clearInterval(tickHandle);
  tickHandle = null;

  if (scheduleCheckHandle !== null) {
    clearInterval(scheduleCheckHandle);
    scheduleCheckHandle = null;
  }

  logger.info("stopSendWorker: send worker tick loop stopped");
}
