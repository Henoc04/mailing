import type { RecipientStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { NotFoundError, ValidationError } from "../errors/errors";
import * as campaignService from "./campaign.service";
import * as contactService from "./contact.service";
import * as mergeEngine from "./mergeEngine.service";
import { sendMail } from "./smtpTransport.service";

async function assertOwned(ownerId: string, campaignId: string): Promise<void> {
  const exists = await prisma.campaign.count({ where: { id: campaignId, ownerId } });
  if (!exists) {
    throw new NotFoundError("Campagne introuvable");
  }
}

// ---------------------------------------------------------------------------
// Test send
// ---------------------------------------------------------------------------

export interface SendTestInput {
  email: string;
  contactId?: string;
}

/**
 * Sends the campaign, exactly as recipients will get it (merge variables,
 * line breaks, attachments, unsubscribe footer), to a single test address.
 * Nothing is recorded: no recipient row, no counters, no tracking pixel.
 */
export async function sendTestEmail(ownerId: string, campaignId: string, input: SendTestInput): Promise<{ sentTo: string }> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerId },
    include: {
      template: { include: { attachments: true } },
      smtpAccounts: { select: { id: true } },
      attachments: true,
      segments: { select: { id: true } },
      tags: { select: { id: true } },
    },
  });
  if (!campaign) {
    throw new NotFoundError("Campagne introuvable");
  }
  if (!campaign.template) {
    throw new ValidationError("Choisissez un modèle avant d'envoyer un test");
  }
  const smtpAccountId = campaign.smtpAccounts[0]?.id;
  if (!smtpAccountId) {
    throw new ValidationError("Choisissez au moins un compte SMTP avant d'envoyer un test");
  }

  // Render with real contact data so merge variables show realistic values:
  // the chosen contact, else the first contact the campaign actually targets.
  let mergeData: Record<string, string> = {};
  if (input.contactId) {
    mergeData = mergeEngine.extractMergeData(await contactService.getById(ownerId, input.contactId));
  } else {
    const [firstTarget] = await campaignService.resolveEligibleContacts(ownerId, {
      targetType: campaign.targetType,
      targetContactId: campaign.targetContactId,
      segmentIds: campaign.segments.map((s) => s.id),
      tagIds: campaign.tags.map((t) => t.id),
    });
    if (firstTarget) {
      mergeData = mergeEngine.extractMergeData(firstTarget);
    }
  }

  const { subject, bodyHtml } = mergeEngine.renderCampaignContent({
    subjectTemplate: campaign.subjectOverride || campaign.template.subject,
    bodyHtmlTemplate: campaign.template.bodyHtml,
    mergeData,
  });
  const html = mergeEngine.appendUnsubscribeFooter(
    bodyHtml,
    mergeEngine.buildUnsubscribeUrl(env.PUBLIC_BASE_URL, "test")
  );

  await sendMail({
    smtpAccountId,
    to: input.email,
    subject: `[TEST] ${subject}`,
    html,
    text: mergeEngine.htmlToText(html),
    attachments: [...campaign.template.attachments, ...campaign.attachments].map((a) => ({
      filename: a.fileName,
      path: a.storedPath,
    })),
  });

  return { sentTo: input.email };
}

// ---------------------------------------------------------------------------
// Per-recipient journal
// ---------------------------------------------------------------------------

export interface RecipientLogItem {
  id: string;
  email: string;
  name: string;
  status: RecipientStatus;
  attempts: number;
  errorMessage: string | null;
  sentAt: Date | null;
  durationMs: number | null;
  openedAt: Date | null;
  openCount: number;
}

export interface RecipientLogPage {
  items: RecipientLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRecipients(
  ownerId: string,
  campaignId: string,
  query: { status?: RecipientStatus; search?: string; page: number; pageSize: number }
): Promise<RecipientLogPage> {
  await assertOwned(ownerId, campaignId);

  const where = {
    campaignId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          contact: {
            OR: [
              { email: { contains: query.search } },
              { nom: { contains: query.search } },
              { prenom: { contains: query.search } },
            ],
          },
        }
      : {}),
  };

  const [recipients, total] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where,
      include: { contact: { select: { email: true, nom: true, prenom: true } } },
      orderBy: [{ sentAt: "desc" }, { createdAt: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.campaignRecipient.count({ where }),
  ]);

  const opens = await prisma.trackingEvent.groupBy({
    by: ["campaignRecipientId"],
    where: { type: "OPEN", campaignRecipientId: { in: recipients.map((r) => r.id) } },
    _min: { occurredAt: true },
    _count: { _all: true },
  });
  const openByRecipient = new Map(opens.map((o) => [o.campaignRecipientId, o] as const));

  return {
    items: recipients.map((r) => {
      const open = openByRecipient.get(r.id);
      return {
        id: r.id,
        email: r.contact.email,
        name: [r.contact.prenom, r.contact.nom].filter(Boolean).join(" "),
        status: r.status,
        attempts: r.attempts,
        errorMessage: r.errorMessage,
        sentAt: r.sentAt,
        durationMs: r.durationMs,
        openedAt: open?._min.occurredAt ?? null,
        openCount: open?._count._all ?? 0,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// ---------------------------------------------------------------------------
// Stats per contact group (tag)
// ---------------------------------------------------------------------------

export interface TagStat {
  tagId: string | null;
  tagName: string;
  recipients: number;
  sent: number;
  failed: number;
  opened: number;
  openRate: number;
}

/**
 * Breaks a campaign's results down by the tags its recipients carry, so the
 * user can see which groups engage. A contact with several tags counts in
 * each of them; untagged contacts are grouped under "Sans groupe".
 */
export async function statsByTag(ownerId: string, campaignId: string): Promise<TagStat[]> {
  await assertOwned(ownerId, campaignId);

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: {
      id: true,
      status: true,
      contact: { select: { tags: { select: { tag: { select: { id: true, name: true } } } } } },
    },
  });
  const openedIds = new Set(
    (
      await prisma.trackingEvent.findMany({
        where: { campaignId, type: "OPEN" },
        select: { campaignRecipientId: true },
        distinct: ["campaignRecipientId"],
      })
    ).map((e) => e.campaignRecipientId)
  );

  const stats = new Map<string, TagStat>();
  for (const r of recipients) {
    const groups = r.contact.tags.length
      ? r.contact.tags.map((t) => ({ id: t.tag.id, name: t.tag.name }))
      : [{ id: null, name: "Sans groupe" }];
    for (const g of groups) {
      const key = g.id ?? "__none__";
      const s = stats.get(key) ?? { tagId: g.id, tagName: g.name, recipients: 0, sent: 0, failed: 0, opened: 0, openRate: 0 };
      s.recipients += 1;
      if (r.status === "SENT") s.sent += 1;
      if (r.status === "FAILED") s.failed += 1;
      if (openedIds.has(r.id)) s.opened += 1;
      stats.set(key, s);
    }
  }

  return Array.from(stats.values())
    .map((s) => ({ ...s, openRate: s.sent > 0 ? Math.round((s.opened / s.sent) * 1000) / 10 : 0 }))
    .sort((a, b) => b.recipients - a.recipients);
}
