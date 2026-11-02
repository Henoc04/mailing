import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import * as campaignsApi from "../../api/campaigns.api";
import type { ApiErrorBody, Campaign, CampaignStatus } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
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

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function ProgressCell({ campaign }: { campaign: Campaign }) {
  const done = campaign.sentCount + campaign.failedCount;
  const pct = campaign.totalRecipients > 0 ? Math.round((done / campaign.totalRecipients) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">
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
      render: (campaign) => <span className="font-medium text-gray-900 dark:text-gray-100">{campaign.name}</span>,
    },
    {
      key: "status",
      header: "Statut",
      render: (campaign) => <Badge color={STATUS_COLORS[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>,
    },
    {
      key: "progress",
      header: "Progression",
      render: (campaign) => <ProgressCell campaign={campaign} />,
    },
    {
      key: "createdAt",
      header: "Créée le",
      render: (campaign) => <span className="text-gray-500 dark:text-gray-400">{formatDate(campaign.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (campaign) => {
        const canEditOrStart = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
        const isLive = campaign.status === "SENDING" || campaign.status === "PAUSED";
        const isSending = campaign.status === "SENDING";

        return (
          <div className="flex flex-wrap items-center gap-2">
            {canEditOrStart && (
              <>
                <Link
                  to={`/campaigns/${campaign.id}/edit`}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
                >
                  Modifier
                </Link>
                <Button size="sm" onClick={() => setStartingCampaign(campaign)}>
                  Démarrer
                </Button>
              </>
            )}
            {isLive && (
              <Link
                to={`/campaigns/${campaign.id}/progress`}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/30"
              >
                Voir la progression
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate(campaign.id)}
            >
              Dupliquer
            </Button>
            {isSending ? (
              <span
                title="Impossible de supprimer une campagne en cours d'envoi"
                className="cursor-not-allowed text-xs text-gray-400 dark:text-gray-600"
              >
                Supprimer
              </span>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setDeletingCampaign(campaign)}>
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Campagnes</h1>
        <Link to="/campaigns/new">
          <Button>Nouvelle campagne</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="text-red-600 dark:text-red-400">Impossible de charger les campagnes.</p>
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
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment démarrer l'envoi de « {startingCampaign?.name} » ? Les destinataires seront
          résolus (si nécessaire) et l'envoi commencera immédiatement.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setStartingCampaign(null)}>
            Annuler
          </Button>
          <Button
            disabled={startMutation.isPending}
            onClick={() => startingCampaign && startMutation.mutate(startingCampaign.id)}
          >
            {startMutation.isPending ? "Démarrage..." : "Démarrer"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={deletingCampaign !== null}
        onClose={() => setDeletingCampaign(null)}
        title="Supprimer la campagne"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer la campagne « {deletingCampaign?.name} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeletingCampaign(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeMutation.isPending}
            onClick={() => deletingCampaign && removeMutation.mutate(deletingCampaign.id)}
          >
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
