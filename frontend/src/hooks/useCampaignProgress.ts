import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as campaignsApi from "../api/campaigns.api";
import type { CampaignProgress, CampaignStatus } from "../api/types";
import { useSocket } from "./useSocket";

export interface CampaignProgressState {
  status: CampaignStatus | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  remaining: number;
  etaSeconds: number | null;
}

// Payload shape emitted by the server on "campaign:progress"
// (backend/src/lib/socket.ts) — a superset of CampaignProgress that also
// identifies which campaign the event is for.
interface CampaignProgressSocketPayload extends CampaignProgress {
  campaignId: string;
}

function computeEtaSeconds(progress: CampaignProgress, baseDelayMs: number): number | null {
  const remaining = Math.max(progress.totalRecipients - progress.sentCount - progress.failedCount, 0);
  if (progress.status !== "SENDING" || remaining === 0) {
    return progress.status === "SENDING" ? 0 : null;
  }
  return Math.round((remaining * baseDelayMs) / 1000);
}

const DEFAULT_BASE_DELAY_MS = 3000;

export function useCampaignProgress(campaignId: string): CampaignProgressState {
  const socket = useSocket();
  const [latest, setLatest] = useState<CampaignProgress | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const { data: polled } = useQuery({
    queryKey: ["campaign-progress", campaignId],
    queryFn: () => campaignsApi.getProgress(campaignId),
    refetchInterval: 3000,
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (polled) {
      // Only overwrite if the socket hasn't delivered something more recent
      // in the last 3s — merge whichever data arrived most recently.
      const now = Date.now();
      if (now - lastUpdateRef.current > 2500) {
        setLatest(polled);
        lastUpdateRef.current = now;
      }
    }
  }, [polled]);

  useEffect(() => {
    if (!socket || !campaignId) {
      return;
    }

    function subscribe() {
      socket?.emit("subscribe:campaign", { campaignId });
    }

    if (socket.connected) {
      subscribe();
    }
    socket.on("connect", subscribe);

    function handleProgress(payload: CampaignProgressSocketPayload) {
      if (payload.campaignId !== campaignId) {
        return;
      }
      setLatest(payload);
      lastUpdateRef.current = Date.now();
    }

    socket.on("campaign:progress", handleProgress);

    return () => {
      socket.off("connect", subscribe);
      socket.off("campaign:progress", handleProgress);
    };
  }, [socket, campaignId]);

  const totalRecipients = latest?.totalRecipients ?? 0;
  const sentCount = latest?.sentCount ?? 0;
  const failedCount = latest?.failedCount ?? 0;
  const remaining = Math.max(totalRecipients - sentCount - failedCount, 0);

  return {
    status: latest?.status ?? null,
    totalRecipients,
    sentCount,
    failedCount,
    openedCount: latest?.openedCount ?? 0,
    clickedCount: latest?.clickedCount ?? 0,
    remaining,
    etaSeconds: latest ? computeEtaSeconds(latest, DEFAULT_BASE_DELAY_MS) : null,
  };
}
