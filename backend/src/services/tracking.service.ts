import { prisma } from "../lib/prisma";
import { emitCampaignProgress } from "../lib/socket";
import { env } from "../config/env";
import * as campaignService from "./campaign.service";
import { isValidClickSignature } from "./mergeEngine.service";

export interface TrackingMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Records a pixel "open" event for a tracking token.
 *
 * Public/unauthenticated-safe: called from a public `<img>` pixel endpoint
 * that must always return an image regardless of what happens here, so an
 * unknown/expired token is silently a no-op rather than throwing.
 *
 * Dedup choice: email opens are frequently re-triggered by proxy image
 * caching/prefetching (e.g. Gmail's image proxy re-fetching the pixel), so
 * counting every fetch would wildly inflate `Campaign.openedCount` above
 * the number of actual unique recipients who opened the email. We only
 * increment the counter the FIRST time an OPEN event is recorded for a
 * given recipient — but we still insert a `TrackingEvent` row every time,
 * since the raw event log (with timestamps/user agents) is useful data on
 * its own and cheap to keep; only the aggregate counter is deduplicated.
 */
export async function recordOpen(trackingToken: string, meta: TrackingMeta): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({ where: { trackingToken } });
  if (!recipient) {
    return;
  }

  const priorOpen = await prisma.trackingEvent.findFirst({
    where: { campaignRecipientId: recipient.id, type: "OPEN" },
    select: { id: true },
  });

  await prisma.trackingEvent.create({
    data: {
      campaignId: recipient.campaignId,
      campaignRecipientId: recipient.id,
      type: "OPEN",
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  if (!priorOpen) {
    await campaignService.updateCounters(recipient.campaignId, { opened: 1 });
  }

  await emitCountersSnapshot(recipient.campaignId);
}

/**
 * Pushes the campaign's full counters (not just "an open happened"): the
 * progress page replaces its state with whatever it receives, so a partial
 * payload would blank its numbers until the next poll.
 */
async function emitCountersSnapshot(campaignId: string): Promise<void> {
  const snapshot = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      status: true,
      totalRecipients: true,
      sentCount: true,
      failedCount: true,
      openedCount: true,
      clickedCount: true,
      startedAt: true,
      completedAt: true,
    },
  });
  if (snapshot) {
    emitCampaignProgress(campaignId, snapshot);
  }
}

const SAFE_URL_SCHEME_PATTERN = /^https?:\/\//i;

/**
 * Validates that a candidate redirect URL is http/https (rejects
 * `javascript:`, `data:`, etc.). Falls back to the app's public base URL
 * when invalid.
 */
function toSafeRedirectUrl(candidateUrl: string): string {
  if (SAFE_URL_SCHEME_PATTERN.test(candidateUrl)) {
    return candidateUrl;
  }
  return env.PUBLIC_BASE_URL;
}

/**
 * Records a "click" event for a tracking token and returns the URL the
 * controller should redirect to.
 *
 * Public/unauthenticated-safe, same lookup-or-noop pattern as `recordOpen`.
 * The redirect target is only trusted when the link's signature matches
 * (see `signClickUrl`), so the endpoint can't serve as an open redirect.
 * Unsigned links are accepted only for a known token: emails sent before
 * signing existed. Anything else lands on `env.PUBLIC_BASE_URL`.
 */
export async function recordClick(
  trackingToken: string,
  targetUrl: string,
  signature: string | undefined,
  meta: TrackingMeta
): Promise<string> {
  if (signature !== undefined && !isValidClickSignature(trackingToken, targetUrl, signature, env.JWT_SECRET)) {
    return env.PUBLIC_BASE_URL;
  }

  const safeUrl = toSafeRedirectUrl(targetUrl);

  const recipient = await prisma.campaignRecipient.findUnique({ where: { trackingToken } });
  if (!recipient) {
    return env.PUBLIC_BASE_URL;
  }

  await prisma.trackingEvent.create({
    data: {
      campaignId: recipient.campaignId,
      campaignRecipientId: recipient.id,
      type: "CLICK",
      url: targetUrl,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  await campaignService.updateCounters(recipient.campaignId, { clicked: 1 });

  await emitCountersSnapshot(recipient.campaignId);

  return safeUrl;
}
