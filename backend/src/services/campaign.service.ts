import type { Campaign, CampaignStatus, CampaignTargetType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../errors/errors";
import type { CreateCampaignInput, UpdateCampaignInput } from "../dto/campaign.dto";
import * as segmentService from "./segment.service";
import * as contactService from "./contact.service";
import type { ContactWithTags } from "./contact.service";
import * as mergeEngineService from "./mergeEngine.service";

/** Prisma `include`/`select` shape shared by `getById` — never selects `encryptedPassword`. */
const CAMPAIGN_DETAIL_INCLUDE = {
  template: { include: { attachments: true } },
  segments: true,
  tags: true,
  smtpAccounts: {
    select: { id: true, label: true, fromEmail: true, fromName: true },
  },
  attachments: true,
} as const;

export type CampaignDetail = Prisma.CampaignGetPayload<{ include: typeof CAMPAIGN_DETAIL_INCLUDE }>;

async function findOwnedOrThrow(ownerId: string, id: string): Promise<Campaign> {
  const campaign = await prisma.campaign.findFirst({ where: { id, ownerId } });
  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }
  return campaign;
}

export async function create(ownerId: string, input: CreateCampaignInput): Promise<Campaign> {
  return prisma.campaign.create({
    data: {
      ownerId,
      name: input.name,
      templateId: input.templateId ?? null,
      subjectOverride: input.subjectOverride ?? null,
      targetType: input.targetType,
      targetContactId: input.targetContactId ?? null,
      segments: input.segmentIds && input.segmentIds.length > 0 ? { connect: input.segmentIds.map((id) => ({ id })) } : undefined,
      tags: input.tagIds && input.tagIds.length > 0 ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
      smtpAccounts: { connect: input.smtpAccountIds.map((id) => ({ id })) },
      useRotation: input.useRotation,
      baseDelayMs: input.baseDelayMs,
      jitterMs: input.jitterMs,
      maxPerMinute: input.maxPerMinute ?? null,
      maxPerHour: input.maxPerHour ?? null,
      maxRetries: input.maxRetries,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: input.scheduledAt ? "SCHEDULED" : "DRAFT",
    },
  });
}

function assertEditable(campaign: Campaign): void {
  const isEditableStatus = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
  if (!isEditableStatus) {
    throw new ValidationError("Impossible de modifier une campagne déjà en cours d'envoi ou terminée");
  }
}

export async function update(ownerId: string, id: string, input: UpdateCampaignInput): Promise<Campaign> {
  const existing = await findOwnedOrThrow(ownerId, id);
  assertEditable(existing);

  const { segmentIds, tagIds, smtpAccountIds, scheduledAt, ...rest } = input;

  return prisma.campaign.update({
    where: { id },
    data: {
      ...rest,
      ...(segmentIds !== undefined ? { segments: { set: segmentIds.map((id) => ({ id })) } } : {}),
      ...(tagIds !== undefined ? { tags: { set: tagIds.map((id) => ({ id })) } } : {}),
      ...(smtpAccountIds !== undefined ? { smtpAccounts: { set: smtpAccountIds.map((id) => ({ id })) } } : {}),
      ...(scheduledAt !== undefined
        ? {
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            // Mirrors create()'s status derivation: setting a schedule date
            // promotes DRAFT -> SCHEDULED; clearing it demotes back to
            // DRAFT. assertEditable() above guarantees `existing.status` is
            // DRAFT or SCHEDULED here, so this never touches a campaign
            // that's SENDING/PAUSED/COMPLETED/etc.
            status: scheduledAt ? "SCHEDULED" : "DRAFT",
          }
        : {}),
    },
  });
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const existing = await findOwnedOrThrow(ownerId, id);
  if (existing.status === "SENDING") {
    throw new ValidationError("Impossible de supprimer une campagne en cours d'envoi");
  }

  // Cascades to recipients/attachments/logs/tracking events via
  // onDelete: Cascade in the schema.
  await prisma.campaign.delete({ where: { id } });
}

export async function list(ownerId: string): Promise<Campaign[]> {
  return prisma.campaign.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
}

export async function getById(ownerId: string, id: string): Promise<CampaignDetail> {
  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: CAMPAIGN_DETAIL_INCLUDE,
  });

  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }

  return campaign;
}

export async function duplicate(ownerId: string, id: string): Promise<Campaign> {
  const existing = await prisma.campaign.findFirst({
    where: { id, ownerId },
    include: { segments: true, tags: true, smtpAccounts: true },
  });

  if (!existing) {
    throw new NotFoundError("Campagne introuvable");
  }

  return prisma.campaign.create({
    data: {
      ownerId,
      name: `${existing.name} (copie)`,
      templateId: existing.templateId,
      subjectOverride: existing.subjectOverride,
      status: "DRAFT",
      targetType: existing.targetType,
      targetContactId: existing.targetContactId,
      segments: { connect: existing.segments.map((s) => ({ id: s.id })) },
      tags: { connect: existing.tags.map((t) => ({ id: t.id })) },
      smtpAccounts: { connect: existing.smtpAccounts.map((a) => ({ id: a.id })) },
      useRotation: existing.useRotation,
      baseDelayMs: existing.baseDelayMs,
      jitterMs: existing.jitterMs,
      maxPerMinute: existing.maxPerMinute,
      maxPerHour: existing.maxPerHour,
      maxRetries: existing.maxRetries,
      scheduledAt: null,
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
      openedCount: 0,
      clickedCount: 0,
    },
  });
}

export interface ResolveRecipientsResult {
  totalRecipients: number;
}

export interface TargetingSelection {
  targetType: CampaignTargetType;
  targetContactId?: string | null;
  segmentIds?: string[];
  tagIds?: string[];
}

/**
 * Resolves a targeting selection (targetType + segmentIds/tagIds/targetContactId)
 * down to the actual list of eligible (non-unsubscribed) contacts. Pure
 * read — does not touch `CampaignRecipient`. Shared by `resolveRecipients`
 * (which materializes the send queue from it) and `previewRecipients`
 * (a non-destructive preview usable before the campaign is even saved).
 */
export async function resolveEligibleContacts(
  ownerId: string,
  selection: TargetingSelection
): Promise<ContactWithTags[]> {
  let candidateContactIds: string[];

  if (selection.targetType === "SINGLE") {
    candidateContactIds = selection.targetContactId ? [selection.targetContactId] : [];
  } else if (selection.targetType === "SEGMENTS") {
    // Targeting can combine dynamic Segments and directly-selected Tags
    // ("groupes de contacts") — a Tag is itself a static group of contacts,
    // so selecting one directly skips the need to build a full Segment
    // filter rule just to reach that group. Union both sources, deduplicated.
    const fromSegments = await segmentService.resolveContactIds(ownerId, selection.segmentIds ?? []);
    const tagIds = selection.tagIds ?? [];
    const fromTags =
      tagIds.length > 0
        ? (
            await prisma.contact.findMany({
              where: { ownerId, tags: { some: { tagId: { in: tagIds } } } },
              select: { id: true },
            })
          ).map((c) => c.id)
        : [];
    candidateContactIds = Array.from(new Set([...fromSegments, ...fromTags]));
  } else {
    const allContacts = await prisma.contact.findMany({
      where: { ownerId, isUnsubscribed: false },
      select: { id: true },
    });
    candidateContactIds = allContacts.map((c) => c.id);
  }

  // Always exclude unsubscribed contacts, regardless of targetType — even
  // for SINGLE, where an unsubscribed target simply resolves to zero
  // recipients rather than being force-sent to.
  const eligibleContacts = await prisma.contact.findMany({
    where: { id: { in: candidateContactIds }, ownerId, isUnsubscribed: false },
    include: { tags: { include: { tag: true } } },
  });

  return eligibleContacts.map(contactService.withFlattenedTags);
}

const PREVIEW_CONTACT_LIMIT = 50;

export interface PreviewRecipientsResult {
  totalCount: number;
  contacts: ContactWithTags[];
}

/** Non-destructive preview of a targeting selection, capped to PREVIEW_CONTACT_LIMIT contacts. */
export async function previewRecipients(
  ownerId: string,
  selection: TargetingSelection
): Promise<PreviewRecipientsResult> {
  const eligibleContacts = await resolveEligibleContacts(ownerId, selection);
  return {
    totalCount: eligibleContacts.length,
    contacts: eligibleContacts.slice(0, PREVIEW_CONTACT_LIMIT),
  };
}

/**
 * Materializes the send queue: determines the target contact ids for the
 * campaign's `targetType`, filters out unsubscribed contacts (always, even
 * for a SINGLE target), and (re)creates one `PENDING` `CampaignRecipient`
 * row per remaining contact with its merge data snapshotted at resolve
 * time.
 *
 * Idempotent/re-runnable: any existing `CampaignRecipient` rows for this
 * campaign are deleted first, so calling this again while the campaign is
 * still DRAFT/SCHEDULED simply recomputes the queue from scratch.
 */
export async function resolveRecipients(ownerId: string, campaignId: string): Promise<ResolveRecipientsResult> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerId },
    include: { segments: true, tags: true },
  });

  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }

  const eligibleContacts = await resolveEligibleContacts(ownerId, {
    targetType: campaign.targetType,
    targetContactId: campaign.targetContactId,
    segmentIds: campaign.segments.map((s) => s.id),
    tagIds: campaign.tags.map((t) => t.id),
  });

  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });

  if (eligibleContacts.length === 0) {
    throw new ValidationError("Aucun destinataire éligible pour cette campagne (liste vide ou tous désabonnés)");
  }

  await prisma.campaignRecipient.createMany({
    data: eligibleContacts.map((contact) => ({
      campaignId,
      contactId: contact.id,
      mergeDataJson: mergeEngineService.extractMergeData(contact) as Prisma.InputJsonValue,
      status: "PENDING",
      nextAttemptAt: new Date(),
    })),
  });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { totalRecipients: eligibleContacts.length },
  });

  return { totalRecipients: eligibleContacts.length };
}

export interface PreviewForContactResult {
  subject: string;
  bodyHtml: string;
}

/**
 * Renders the campaign's subject/body for a single contact WITHOUT
 * tracking injection — this is purely for the user to verify merge
 * variables render correctly, not an actual send, so link rewriting and the
 * open pixel are intentionally skipped.
 */
export async function previewForContact(
  ownerId: string,
  campaignId: string,
  contactId: string
): Promise<PreviewForContactResult> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerId },
    include: { template: true },
  });

  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }
  if (!campaign.template) {
    throw new ValidationError("Cette campagne n'a pas de modèle associé");
  }

  const contact = await contactService.getById(ownerId, contactId);
  const mergeData = mergeEngineService.extractMergeData(contact);

  return mergeEngineService.renderCampaignContent({
    subjectTemplate: campaign.subjectOverride || campaign.template.subject,
    bodyHtmlTemplate: campaign.template.bodyHtml,
    mergeData,
  });
}

export interface UpdateCountersDelta {
  sent?: number;
  failed?: number;
  opened?: number;
  clicked?: number;
}

/** Atomically increments the campaign's counter fields. Exported for the future sendWorker/tracking service. */
export async function updateCounters(campaignId: string, delta: UpdateCountersDelta): Promise<void> {
  const data: Prisma.CampaignUpdateInput = {};

  if (delta.sent) {
    data.sentCount = { increment: delta.sent };
  }
  if (delta.failed) {
    data.failedCount = { increment: delta.failed };
  }
  if (delta.opened) {
    data.openedCount = { increment: delta.opened };
  }
  if (delta.clicked) {
    data.clickedCount = { increment: delta.clicked };
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.campaign.update({ where: { id: campaignId }, data });
}

export interface MarkStatusExtra {
  startedAt?: Date;
  completedAt?: Date;
}

/** Exported for the future sendWorker to call for pause/resume/cancel/complete transitions. */
export async function markStatus(campaignId: string, status: CampaignStatus, extra?: MarkStatusExtra): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status,
      ...(extra?.startedAt ? { startedAt: extra.startedAt } : {}),
      ...(extra?.completedAt ? { completedAt: extra.completedAt } : {}),
    },
  });
}
