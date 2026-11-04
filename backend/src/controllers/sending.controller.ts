import type { Request, Response } from "express";
import { asyncHandler } from "./asyncHandler";
import * as sendQueueService from "../services/sendQueue.service";
import * as campaignService from "../services/campaign.service";

export const start = asyncHandler(async (req: Request, res: Response) => {
  await sendQueueService.startCampaign(req.user!.id, req.params.id);
  res.status(200).json({ success: true });
});

export const pause = asyncHandler(async (req: Request, res: Response) => {
  await sendQueueService.pauseCampaign(req.user!.id, req.params.id);
  res.status(200).json({ success: true });
});

export const resume = asyncHandler(async (req: Request, res: Response) => {
  await sendQueueService.resumeCampaign(req.user!.id, req.params.id);
  res.status(200).json({ success: true });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  await sendQueueService.cancelCampaign(req.user!.id, req.params.id);
  res.status(200).json({ success: true });
});

export const progress = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.getById(req.user!.id, req.params.id);

  res.status(200).json({
    status: campaign.status,
    pauseReason: campaign.pauseReason,
    totalRecipients: campaign.totalRecipients,
    sentCount: campaign.sentCount,
    failedCount: campaign.failedCount,
    openedCount: campaign.openedCount,
    clickedCount: campaign.clickedCount,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
  });
});
