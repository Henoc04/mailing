import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import * as draftsApi from "../../api/drafts.api";
import type { DraftType } from "../../api/drafts.api";
import * as campaignsApi from "../../api/campaigns.api";
import * as templatesApi from "../../api/templates.api";
import type { Draft } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Table, type TableColumn } from "../../components/ui/Table";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";

type TypeFilter = "ALL" | DraftType;

const TYPE_LABELS: Record<DraftType, string> = {
  CAMPAIGN: "Campagne",
  TEMPLATE: "Modèle",
};

const TYPE_COLORS: Record<DraftType, BadgeColor> = {
  CAMPAIGN: "purple",
  TEMPLATE: "blue",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function DraftsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [deletingDraft, setDeletingDraft] = useState<Draft | null>(null);

  const { data: drafts, isLoading, isError } = useQuery({
    queryKey: ["drafts", typeFilter],
    queryFn: () => draftsApi.list(typeFilter === "ALL" ? undefined : typeFilter),
  });

  const removeMutation = useMutation({
    mutationFn: (draft: Draft) =>
      draft.type === "CAMPAIGN" ? campaignsApi.remove(draft.id) : templatesApi.remove(draft.id),
    onSuccess: (_result, draft) => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: [draft.type === "CAMPAIGN" ? "campaigns" : "templates"] });
      showToast("Brouillon supprimé", "success");
      setDeletingDraft(null);
    },
    onError: () => showToast("Impossible de supprimer le brouillon", "error"),
  });

  function openDraft(draft: Draft) {
    navigate(draft.type === "CAMPAIGN" ? `/campaigns/${draft.id}/edit` : `/templates/${draft.id}`);
  }

  const columns: TableColumn<Draft>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Nom",
        render: (draft) => (
          <div className="min-w-0 max-w-[11rem] min-[420px]:max-w-[14rem] sm:max-w-md">
            <p className="truncate font-medium text-gray-900 dark:text-gray-100" title={draft.name}>
              {draft.name}
            </p>
            {/* Date shown under the name on phones, where its column is hidden. */}
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 md:hidden">
              {formatDateTime(draft.updatedAt ?? draft.createdAt)}
            </p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        render: (draft) => (
          <Badge dot color={TYPE_COLORS[draft.type]}>
            {TYPE_LABELS[draft.type]}
          </Badge>
        ),
      },
      {
        key: "updatedAt",
        header: "Mis à jour le",
        hideBelow: "md",
        className: "whitespace-nowrap tabular-nums",
        render: (draft) => formatDateTime(draft.updatedAt ?? draft.createdAt),
      },
      {
        key: "actions",
        header: <span className="sr-only sm:not-sr-only">Actions</span>,
        className: "text-right",
        render: (draft) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => openDraft(draft)}>
              Ouvrir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300 sm:px-3"
              aria-label={`Supprimer le brouillon ${draft.name}`}
              onClick={() => setDeletingDraft(draft)}
            >
              <Icon name="trash" className="h-4 w-4" />
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Brouillons" description="Reprenez vos campagnes et modèles en cours de rédaction." />

      <div
        role="tablist"
        aria-label="Filtrer par type"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      >
        {(["ALL", "CAMPAIGN", "TEMPLATE"] as TypeFilter[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={typeFilter === option}
            onClick={() => setTypeFilter(option)}
            className={clsx(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition",
              typeFilter === option
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            )}
          >
            {option === "ALL" ? "Tous" : option === "CAMPAIGN" ? "Campagnes" : "Modèles"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>Impossible de charger les brouillons.</ErrorState>
      ) : (
        <Table
          columns={columns}
          rows={drafts ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Aucun brouillon enregistré."
        />
      )}

      <Modal
        isOpen={deletingDraft !== null}
        onClose={() => setDeletingDraft(null)}
        size="sm"
        title="Supprimer le brouillon"
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le brouillon « {deletingDraft?.name} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setDeletingDraft(null)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => deletingDraft && removeMutation.mutate(deletingDraft)}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
