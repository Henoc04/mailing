import type { Campaign, CampaignRecipient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../errors/errors";
import * as campaignService from "./campaign.service";

async function findOwnedCampaignOrThrow(ownerId: string, campaignId: string): Promise<Campaign> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerId } });
  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }
  return campaign;
}

/**
 * Resolves recipients (only if none exist yet — see `startCampaign` doc) and
 * flips the campaign to SENDING. Shared by `startCampaign` (user-triggered)
 * and `startDueScheduledCampaigns` (worker-triggered) so both go through the
 * exact same activation logic.
 */
async function activateCampaign(campaign: Campaign): Promise<void> {
  const existingRecipientCount = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  if (existingRecipientCount === 0) {
    await campaignService.resolveRecipients(campaign.ownerId, campaign.id);
  }

  await campaignService.markStatus(campaign.id, "SENDING", { startedAt: new Date() });
}

/**
 * Starts (or resumes-from-scratch) sending a campaign. Resolves recipients
 * only if none exist yet — if the campaign was already resolved in a prior
 * run (e.g. it's being restarted after being paused before any resolve
 * happened), we don't want to blow away in-flight/already-sent recipient
 * rows by re-resolving.
 */
export async function startCampaign(ownerId: string, campaignId: string): Promise<void> {
  const campaign = await findOwnedCampaignOrThrow(ownerId, campaignId);

  const isStartable = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
  if (!isStartable) {
    throw new ValidationError("Seule une campagne à l'état brouillon ou planifiée peut être démarrée");
  }

  await activateCampaign(campaign);
}

/**
 * INTERNAL WORKER-ONLY FUNCTION — deliberately has NO ownerId scoping, for
 * the same reason as `getNextDueRecipient` (see its doc comment): it's
 * polled globally across every user's campaigns by the sendWorker, never
 * exposed through a controller/route.
 *
 * Finds every SCHEDULED campaign whose `scheduledAt` has passed and
 * activates it, so a campaign the user scheduled for a future date/time
 * actually starts sending on its own instead of sitting in SCHEDULED forever.
 */
export async function startDueScheduledCampaigns(): Promise<void> {
  const dueCampaigns = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
  });

  for (const campaign of dueCampaigns) {
    await activateCampaign(campaign);
  }
}

export async function pauseCampaign(ownerId: string, campaignId: string): Promise<void> {
  const campaign = await findOwnedCampaignOrThrow(ownerId, campaignId);

  if (campaign.status !== "SENDING") {
    throw new ValidationError("Seule une campagne en cours d'envoi peut être mise en pause");
  }

  await campaignService.markStatus(campaignId, "PAUSED");
}

export async function resumeCampaign(ownerId: string, campaignId: string): Promise<void> {
  const campaign = await findOwnedCampaignOrThrow(ownerId, campaignId);

  if (campaign.status !== "PAUSED") {
    throw new ValidationError("Seule une campagne en pause peut être reprise");
  }

  await campaignService.markStatus(campaignId, "SENDING");
}

export async function cancelCampaign(ownerId: string, campaignId: string): Promise<void> {
  const campaign = await findOwnedCampaignOrThrow(ownerId, campaignId);

  const isCancellable = campaign.status === "SENDING" || campaign.status === "PAUSED" || campaign.status === "SCHEDULED";
  if (!isCancellable) {
    throw new ValidationError("Cette campagne ne peut pas être annulée dans son état actuel");
  }

  await campaignService.markStatus(campaignId, "CANCELLED");

  await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: { in: ["PENDING", "SENDING"] } },
    data: { status: "CANCELLED" },
  });
}

export type DueRecipient = CampaignRecipient & { campaign: Campaign };

/**
 * INTERNAL WORKER-ONLY FUNCTION — deliberately has NO ownerId scoping. The
 * future in-process sendWorker polls this globally across every user's
 * campaigns; it is never exposed through a controller/route, so there is
 * no multi-tenant boundary to enforce here (the worker is a trusted,
 * server-side-only process).
 *
 * Finds the single most overdue PENDING recipient belonging to a campaign
 * that is currently SENDING, skipping `excludedCampaignIds` (campaigns the
 * worker is currently pacing or rate-limiting).
 */
export async function getNextDueRecipient(excludedCampaignIds: string[] = []): Promise<DueRecipient | null> {
  return prisma.campaignRecipient.findFirst({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: new Date() },
      campaign: { status: "SENDING" },
      ...(excludedCampaignIds.length > 0 ? { campaignId: { notIn: excludedCampaignIds } } : {}),
    },
    orderBy: { nextAttemptAt: "asc" },
    include: { campaign: true },
  });
}

/**
 * Optimistically claims a recipient by flipping it to SENDING. This is a
 * simple optimistic claim, not a true distributed lock — acceptable
 * because the sendWorker is designed to run as a single process. A second
 * worker instance polling concurrently could theoretically race past this
 * check, but that scenario is out of scope for this single-process design.
 */
export async function markRecipientSending(recipientId: string): Promise<void> {
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: "SENDING" },
  });
}

/** Puts a claimed recipient back in the queue untouched (no attempt counted). */
export async function releaseRecipient(recipientId: string): Promise<void> {
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: "PENDING" },
  });
}

/** Resolves the recipient's email + a subject for SendLog rows, and its campaignId. */
async function loadRecipientForLogging(recipientId: string): Promise<{
  campaignId: string;
  recipientEmail: string;
  subject: string;
  attempts: number;
}> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      contact: true,
      campaign: { include: { template: true } },
    },
  });

  if (!recipient) {
    throw new NotFoundError("Destinataire de campagne introuvable");
  }

  const subject = recipient.campaign.subjectOverride || recipient.campaign.template?.subject || "";

  return {
    campaignId: recipient.campaignId,
    recipientEmail: recipient.contact.email,
    subject,
    attempts: recipient.attempts,
  };
}

/**
 * If the campaign has no remaining PENDING/SENDING recipients, marks it
 * COMPLETED. Shared by both `markRecipientSent` and `markRecipientFailed`
 * (once a recipient reaches its terminal FAILED state) so the campaign
 * transitions to COMPLETED as soon as the last recipient finishes, however
 * it finished.
 */
async function checkCampaignCompletion(campaignId: string): Promise<void> {
  const remaining = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "SENDING"] } },
  });

  if (remaining === 0) {
    await campaignService.markStatus(campaignId, "COMPLETED", { completedAt: new Date() });
  }
}

/**
 * Drops a queued recipient without sending (e.g. the contact unsubscribed or
 * was flagged as a hard bounce after the queue was materialized). Not
 * counted as a failure: nothing went wrong, the send simply no longer applies.
 */
export async function markRecipientSkipped(recipientId: string, reason: string): Promise<void> {
  const recipient = await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: "CANCELLED", errorMessage: reason },
  });
  await checkCampaignCompletion(recipient.campaignId);
}

export interface MarkRecipientSentParams {
  smtpAccountId: string;
  durationMs: number;
}

export async function markRecipientSent(recipientId: string, params: MarkRecipientSentParams): Promise<void> {
  const { campaignId, recipientEmail, subject } = await loadRecipientForLogging(recipientId);

  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      smtpAccountId: params.smtpAccountId,
      durationMs: params.durationMs,
    },
  });

  await prisma.sendLog.create({
    data: {
      campaignId,
      smtpAccountId: params.smtpAccountId,
      recipientEmail,
      subject,
      status: "SENT",
      durationMs: params.durationMs,
    },
  });

  await campaignService.updateCounters(campaignId, { sent: 1 });
  await checkCampaignCompletion(campaignId);
}

export interface MarkRecipientFailedParams {
  errorMessage: string;
  retryable: boolean;
  maxRetries: number;
  smtpAccountId?: string;
  durationMs?: number;
}

/**
 * Records a failed send attempt. If the error is retryable and the
 * recipient hasn't exhausted `maxRetries`, it's requeued as PENDING with an
 * exponential backoff `nextAttemptAt` (capped at 60s). Otherwise it's
 * marked permanently FAILED. A SendLog row is always created; the
 * campaign's `failedCount` counter (and the completion check) is only
 * updated when the recipient reaches the terminal FAILED state — an
 * intermediate retry is not counted as a failure yet since it may still
 * succeed on a later attempt.
 */
export async function markRecipientFailed(recipientId: string, params: MarkRecipientFailedParams): Promise<void> {
  const { campaignId, recipientEmail, subject, attempts } = await loadRecipientForLogging(recipientId);

  const nextAttempts = attempts + 1;
  const willRetry = params.retryable && nextAttempts < params.maxRetries;

  if (willRetry) {
    const backoffMs = Math.min(60000, 2 ** nextAttempts * 1000);

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: "PENDING",
        attempts: nextAttempts,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        errorMessage: params.errorMessage,
        ...(params.smtpAccountId ? { smtpAccountId: params.smtpAccountId } : {}),
        ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
      },
    });

    await prisma.sendLog.create({
      data: {
        campaignId,
        smtpAccountId: params.smtpAccountId,
        recipientEmail,
        subject,
        status: "PENDING",
        errorMessage: params.errorMessage,
        durationMs: params.durationMs,
      },
    });

    return;
  }

  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: "FAILED",
      attempts: nextAttempts,
      errorMessage: params.errorMessage,
      ...(params.smtpAccountId ? { smtpAccountId: params.smtpAccountId } : {}),
      ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
    },
  });

  await prisma.sendLog.create({
    data: {
      campaignId,
      smtpAccountId: params.smtpAccountId,
      recipientEmail,
      subject,
      status: "FAILED",
      errorMessage: params.errorMessage,
      durationMs: params.durationMs,
    },
  });

  await campaignService.updateCounters(campaignId, { failed: 1 });
  await checkCampaignCompletion(campaignId);
}
