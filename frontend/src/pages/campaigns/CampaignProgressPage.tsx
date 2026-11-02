import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import * as campaignsApi from "../../api/campaigns.api";
import type { ApiErrorBody, CampaignStatus } from "../../api/types";
import { useCampaignProgress } from "../../hooks/useCampaignProgress";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";
import { RecipientsLog } from "../../components/campaigns/RecipientsLog";
import { TagStatsTable } from "../../components/campaigns/TagStatsTable";
import { CLICK_TRACKING_ENABLED } from "../../config/features";

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Planifiée",
  SENDING: "En cours d'envoi",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  FAILED: "Échouée",
};

const STATUS_COLORS: Record<CampaignStatus, BadgeColor> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  SENDING: "yellow",
  PAUSED: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  FAILED: "red",
};

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

function formatEta(etaSeconds: number | null): string {
  if (etaSeconds === null) {
    return "—";
  }
  if (etaSeconds <= 0) {
    return "Presque terminé";
  }
  const minutes = Math.floor(etaSeconds / 60);
  const seconds = etaSeconds % 60;
  if (minutes === 0) {
    return `≈ ${seconds} s`;
  }
  return `≈ ${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

interface StatTileProps {
  label: string;
  value: number;
  accent?: string;
}

function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-gray-900 dark:text-gray-100"}`}>
        {value.toLocaleString("fr-FR")}
      </p>
    </div>
  );
}

export default function CampaignProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const campaignId = id ?? "";
  const progress = useCampaignProgress(campaignId);

  // useCampaignProgress is purely reactive (socket push + 3s poll fallback,
  // both funneled into local state) — it exposes no refetch function, so
  // after a mutation we invalidate the underlying react-query key it polls
  // ("campaign-progress", campaignId) to force an immediate refresh instead
  // of waiting up to 3s for the next poll tick.
  function refreshProgress() {
    queryClient.invalidateQueries({ queryKey: ["campaign-progress", campaignId] });
  }

  const pauseMutation = useMutation({
    mutationFn: () => campaignsApi.pause(campaignId),
    onSuccess: () => {
      showToast("Campagne mise en pause", "success");
      refreshProgress();
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de mettre en pause"), "error"),
  });

  const resumeMutation = useMutation({
    mutationFn: () => campaignsApi.resume(campaignId),
    onSuccess: () => {
      showToast("Campagne reprise", "success");
      refreshProgress();
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de reprendre l'envoi"), "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => campaignsApi.cancel(campaignId),
    onSuccess: () => {
      showToast("Campagne annulée", "success");
      setIsCancelModalOpen(false);
      refreshProgress();
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible d'annuler la campagne"), "error"),
  });

  if (!campaignId) {
    return <p className="text-red-600 dark:text-red-400">Identifiant de campagne manquant.</p>;
  }

  const status = progress.status;
  const done = progress.sentCount + progress.failedCount;
  const pct = progress.totalRecipients > 0 ? Math.round((done / progress.totalRecipients) * 100) : 0;

  const canPause = status === "SENDING";
  const canResume = status === "PAUSED";
  const canCancel = status === "SENDING" || status === "PAUSED" || status === "SCHEDULED";
  const isFinal = status === "COMPLETED" || status === "CANCELLED" || status === "FAILED";

  const finalMessage: Record<string, string> = {
    COMPLETED: "L'envoi de cette campagne est terminé.",
    CANCELLED: "Cette campagne a été annulée.",
    FAILED: "L'envoi de cette campagne a échoué.",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Progression de l'envoi</h1>
          {status ? (
            <Badge color={STATUS_COLORS[status]} className="text-sm">
              {STATUS_LABELS[status]}
            </Badge>
          ) : (
            <Badge color="gray">Chargement...</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canPause && (
            <Button variant="secondary" disabled={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
              {pauseMutation.isPending ? "Mise en pause..." : "Mettre en pause"}
            </Button>
          )}
          {canResume && (
            <Button disabled={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
              {resumeMutation.isPending ? "Reprise..." : "Reprendre"}
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" onClick={() => setIsCancelModalOpen(true)}>
              Annuler
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate("/campaigns")}>
            Retour à la liste
          </Button>
        </div>
      </div>

      {isFinal && status && (
        <div className="card border-l-4 border-l-brand-500">
          <p className="text-sm text-gray-700 dark:text-gray-300">{finalMessage[status]}</p>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {done.toLocaleString("fr-FR")} / {progress.totalRecipients.toLocaleString("fr-FR")} traités
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Restants : {progress.remaining.toLocaleString("fr-FR")}</span>
          <span>ETA : {formatEta(progress.etaSeconds)}</span>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${CLICK_TRACKING_ENABLED ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatTile label="Envoyés" value={progress.sentCount} accent="text-green-600 dark:text-green-400" />
        <StatTile label="Échecs" value={progress.failedCount} accent="text-red-600 dark:text-red-400" />
        <StatTile label="Ouvertures" value={progress.openedCount} accent="text-brand-600 dark:text-brand-400" />
        {CLICK_TRACKING_ENABLED && (
          <StatTile label="Clics" value={progress.clickedCount} accent="text-purple-600 dark:text-purple-400" />
        )}
      </div>

      <TagStatsTable campaignId={campaignId} />

      <RecipientsLog campaignId={campaignId} />

      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Annuler la campagne">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment annuler cette campagne ? Les destinataires non encore traités ne recevront
          pas l'email. Cette action est irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setIsCancelModalOpen(false)}>
            Retour
          </Button>
          <Button variant="danger" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
            {cancelMutation.isPending ? "Annulation..." : "Confirmer l'annulation"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
