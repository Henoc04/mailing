import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import clsx from "clsx";
import * as campaignsApi from "../../api/campaigns.api";
import type { ApiErrorBody, CampaignStatus } from "../../api/types";
import { useCampaignProgress } from "../../hooks/useCampaignProgress";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState } from "../../components/ui/States";
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

type Tone = "brand" | "red" | "emerald" | "violet";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
};

interface StatTileProps {
  label: string;
  value: number;
  icon: IconName;
  tone: Tone;
}

function StatTile({ label, value, icon, tone }: StatTileProps) {
  return (
    <div className="card flex items-start gap-4">
      <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[tone])}>
        <Icon name={icon} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
          {value.toLocaleString("fr-FR")}
        </p>
      </div>
    </div>
  );
}

const FINAL_TONES: Record<string, string> = {
  COMPLETED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  CANCELLED: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300",
  FAILED: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};

const FINAL_ICONS: Record<string, IconName> = {
  COMPLETED: "checkCircle",
  CANCELLED: "info",
  FAILED: "alert",
};

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
    return <ErrorState>Identifiant de campagne manquant.</ErrorState>;
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
      <PageHeader
        back={{ to: "/campaigns", label: "Campagnes" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            Progression de l'envoi
            {status ? (
              <Badge dot={status !== "SENDING"} color={STATUS_COLORS[status]} className="text-sm">
                {/* Live sending: pulsing dot instead of the static one. */}
                {status === "SENDING" && (
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </span>
                )}
                {STATUS_LABELS[status]}
              </Badge>
            ) : (
              <Badge color="gray">Chargement…</Badge>
            )}
          </span>
        }
        description="Suivi en temps réel des envois, ouvertures et échecs."
        actions={
          <>
            {canPause && (
              <Button type="button" variant="secondary" loading={pauseMutation.isPending} onClick={() => pauseMutation.mutate()}>
                Mettre en pause
              </Button>
            )}
            {canResume && (
              <Button type="button" loading={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
                {!resumeMutation.isPending && <Icon name="send" className="h-4 w-4" />}
                Reprendre
              </Button>
            )}
            {canCancel && (
              <Button type="button" variant="danger" onClick={() => setIsCancelModalOpen(true)}>
                Annuler
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => navigate("/campaigns")}>
              Retour à la liste
            </Button>
          </>
        }
      />

      {isFinal && status && (
        <div className={clsx("flex items-start gap-3 rounded-xl border p-4 text-sm", FINAL_TONES[status])}>
          <Icon name={FINAL_ICONS[status]} className="mt-0.5 shrink-0" />
          <p>{finalMessage[status]}</p>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Progression</p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">{pct}%</p>
          </div>
          <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">{done.toLocaleString("fr-FR")}</span> /{" "}
            {progress.totalRecipients.toLocaleString("fr-FR")} traités
          </p>
        </div>
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="tabular-nums">Restants : {progress.remaining.toLocaleString("fr-FR")}</span>
          <span className="tabular-nums">ETA : {formatEta(progress.etaSeconds)}</span>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${CLICK_TRACKING_ENABLED ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatTile label="Envoyés" value={progress.sentCount} icon="send" tone="emerald" />
        <StatTile label="Échecs" value={progress.failedCount} icon="alert" tone="red" />
        <StatTile label="Ouvertures" value={progress.openedCount} icon="mailOpen" tone="brand" />
        {CLICK_TRACKING_ENABLED && (
          <StatTile label="Clics" value={progress.clickedCount} icon="cursor" tone="violet" />
        )}
      </div>

      <TagStatsTable campaignId={campaignId} />

      <RecipientsLog campaignId={campaignId} />

      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Annuler la campagne"
        size="sm"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment annuler cette campagne ? Les destinataires non encore traités ne recevront
          pas l'email. Cette action est irréversible.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setIsCancelModalOpen(false)}>
            Retour
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            Confirmer l'annulation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
