import { prisma } from "../lib/prisma";

export type DraftType = "CAMPAIGN" | "TEMPLATE";

export interface DraftSummary {
  id: string;
  type: DraftType;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * "Brouillons" is a virtual list, not its own table: it surfaces campaigns
 * with status DRAFT and templates with isDraft=true side by side. `type`
 * filters to just one of the two; omitted, both are unioned and sorted by
 * most-recently-updated first.
 */
export async function list(ownerId: string, type?: string): Promise<DraftSummary[]> {
  const includeCampaigns = type === undefined || type === "CAMPAIGN";
  const includeTemplates = type === undefined || type === "TEMPLATE";

  const [draftCampaigns, draftTemplates] = await Promise.all([
    includeCampaigns
      ? prisma.campaign.findMany({
          where: { ownerId, status: "DRAFT" },
          select: { id: true, name: true, createdAt: true, updatedAt: true },
        })
      : Promise.resolve([]),
    includeTemplates
      ? prisma.template.findMany({
          where: { ownerId, isDraft: true },
          select: { id: true, name: true, createdAt: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  const drafts: DraftSummary[] = [
    ...draftCampaigns.map((c) => ({ ...c, type: "CAMPAIGN" as const })),
    ...draftTemplates.map((t) => ({ ...t, type: "TEMPLATE" as const })),
  ];

  return drafts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
