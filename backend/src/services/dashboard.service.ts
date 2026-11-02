import { prisma } from "../lib/prisma";

export interface RecentCampaignSummary {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  createdAt: Date;
}

export interface DashboardSummary {
  totalSent: number;
  totalFailed: number;
  totalOpened: number;
  totalClicked: number;
  activeCampaigns: number;
  totalContacts: number;
  recentCampaigns: RecentCampaignSummary[];
}

export async function getSummary(ownerId: string): Promise<DashboardSummary> {
  const [aggregate, activeCampaigns, totalContacts, recentCampaigns] = await Promise.all([
    prisma.campaign.aggregate({
      where: { ownerId },
      _sum: {
        sentCount: true,
        failedCount: true,
        openedCount: true,
        clickedCount: true,
      },
    }),
    prisma.campaign.count({
      where: { ownerId, status: { in: ["SENDING", "SCHEDULED"] } },
    }),
    prisma.contact.count({ where: { ownerId } }),
    prisma.campaign.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        openedCount: true,
        clickedCount: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    totalSent: aggregate._sum.sentCount ?? 0,
    totalFailed: aggregate._sum.failedCount ?? 0,
    totalOpened: aggregate._sum.openedCount ?? 0,
    totalClicked: aggregate._sum.clickedCount ?? 0,
    activeCampaigns,
    totalContacts,
    recentCampaigns,
  };
}
