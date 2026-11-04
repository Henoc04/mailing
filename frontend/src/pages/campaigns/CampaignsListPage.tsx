import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import * as campaignsApi from "../../api/campaigns.api";
import type { ApiErrorBody, Campaign, CampaignStatus } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { Table, type TableColumn } from "../../components/ui/Table";
import { useToast } from "../../components/ui/ToastProvider";

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Planifiée",
  SENDING: "En cours d'envoi",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  FAILED: "Échouée",
};

// Only six Badge colors exist (gray/blue/green/red/yellow/purple) — PAUSED
// (spec calls for "orange") is mapped onto "yellow" since it's the closest
// warning-toned option actually available on the Badge component.
const STATUS_COLORS: Record<CampaignStatus, BadgeColor> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  SENDING: "yellow",
  PAUSED: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  FAILED: "red",
};

const PRIMARY_LINK_CLASS = "btn h-10 bg-brand-600 px-4 text-sm text-white shadow-sm hover:bg-brand-500";
const ROW_LINK_CLASS =
  "btn h-8 px-3 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10";

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function ProgressCell({ campaign, compact = false }: { campaign: Campaign; compact?: boolean }) {
  const done = campaign.sentCount + campaign.failedCount;
  const pct = campaign.totalRecipients > 0 ? Math.round((done / campaign.totalRecipients) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div
        className={
          compact
            ? "h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            : "h-1.5 w-32 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        }
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {done}/{campaign.totalRecipients}
      </span>
    </div>
  );
}

export default function CampaignsListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [startingCampaign, setStartingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.start(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      showToast("Campagne démarrée", "success");
      setStartingCampaign(null);
      navigate(`/campaigns/${id}/progress`);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de démarrer la campagne"), "error"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      showToast("Campagne dupliquée", "success");
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de dupliquer la campagne"), "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      showToast("Campagne supprimée", "success");
      setDeletingCampaign(null);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de supprimer la campagne"), "error"),
  });

  const columns: TableColumn<Campaign>[] = [
    {
      key: "name",
      header: "Nom",
      className: "min-w-[10rem]",
      render: (campaign) => (
        <div className="min-w-0 space-y-1.5">
          <p className="break-words font-medium text-gray-900 dark:text-gray-100">{campaign.name}</p>
          {/* Secondary columns are hidden on small screens: repeat their info here. */}
          <div className="sm:hidden">
            <ProgressCell campaign={campaign} compact />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 md:hidden">Créée le {formatDate(campaign.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Statut",
      render: (campaign) => (
        <div className="space-y-1">
          <Badge dot color={STATUS_COLORS[campaign.status]}>
            {STATUS_LABELS[campaign.status]}
          </Badge>
          {campaign.status === "PAUSED" && campaign.pauseReason && (
            <p className="flex max-w-[16rem] items-start gap-1 text-xs text-amber-700 dark:text-amber-300" title={campaign.pauseReason}>
              <Icon name="alert" className="mt-px h-3.5 w-3.5" />
              <span className="line-clamp-2">Pause automatique : {campaign.pauseReason}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progression",
      hideBelow: "sm",
      render: (campaign) => <ProgressCell campaign={campaign} />,
    },
    {
      key: "createdAt",
      header: "Créée le",
      hideBelow: "md",
      render: (campaign) => (
        <span className="whitespace-nowrap text-gray-500 dark:text-gray-400">{formatDate(campaign.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (campaign) => {
        const canEditOrStart = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
        const isLive = campaign.status === "SENDING" || campaign.status === "PAUSED";
        const isSending = campaign.status === "SENDING";

        return (
          <div className="flex min-w-[9rem] flex-wrap items-center gap-1.5">
            {canEditOrStart && (
              <>
                <Button type="button" size="sm" onClick={() => setStartingCampaign(campaign)}>
                  <Icon name="send" className="h-3.5 w-3.5" />
                  Démarrer
                </Button>
                <Link to={`/campaigns/${campaign.id}/edit`} className={ROW_LINK_CLASS}>
                  Modifier
                </Link>
              </>
            )}
            {isLive && (
              <Link to={`/campaigns/${campaign.id}/progress`} className={ROW_LINK_CLASS}>
                <Icon name="chart" className="h-3.5 w-3.5" />
                Voir la progression
              </Link>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={duplicateMutation.isPending}
              loading={duplicateMutation.isPending && duplicateMutation.variables === campaign.id}
              onClick={() => duplicateMutation.mutate(campaign.id)}
            >
              Dupliquer
            </Button>
            {isSending ? (
              <span
                title="Impossible de supprimer une campagne en cours d'envoi"
                className="inline-flex h-8 cursor-not-allowed items-center px-3 text-xs text-gray-400 dark:text-gray-600"
              >
                Supprimer
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                onClick={() => setDeletingCampaign(campaign)}
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campagnes"
        description="Créez, lancez et suivez vos campagnes d'emailing."
        actions={
          <Link to="/campaigns/new" className={PRIMARY_LINK_CLASS}>
            <Icon name="plus" className="h-4 w-4" />
            Nouvelle campagne
          </Link>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>Impossible de charger les campagnes.</ErrorState>
      ) : (campaigns ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <EmptyState
            icon="send"
            title="Aucune campagne pour le moment."
            description="Créez votre première campagne pour commencer à envoyer."
            action={
              <Link to="/campaigns/new" className={PRIMARY_LINK_CLASS}>
                <Icon name="plus" className="h-4 w-4" />
                Nouvelle campagne
              </Link>
            }
          />
        </div>
      ) : (
        <Table
          columns={columns}
          rows={campaigns ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Aucune campagne pour le moment."
        />
      )}

      <Modal
        isOpen={startingCampaign !== null}
        onClose={() => setStartingCampaign(null)}
        title="Démarrer la campagne"
        size="sm"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment démarrer l'envoi de « {startingCampaign?.name} » ? Les destinataires seront
          résolus (si nécessaire) et l'envoi commencera immédiatement.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setStartingCampaign(null)}>
            Annuler
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            loading={startMutation.isPending}
            onClick={() => startingCampaign && startMutation.mutate(startingCampaign.id)}
          >
            {!startMutation.isPending && <Icon name="send" className="h-4 w-4" />}
            Démarrer
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={deletingCampaign !== null}
        onClose={() => setDeletingCampaign(null)}
        title="Supprimer la campagne"
        size="sm"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer la campagne « {deletingCampaign?.name} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setDeletingCampaign(null)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => deletingCampaign && removeMutation.mutate(deletingCampaign.id)}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
