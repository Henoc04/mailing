import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as draftsApi from "../../api/drafts.api";
import type { DraftType } from "../../api/drafts.api";
import * as campaignsApi from "../../api/campaigns.api";
import * as templatesApi from "../../api/templates.api";
import type { Draft } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Table, type TableColumn } from "../../components/ui/Table";
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
        render: (draft) => <span className="font-medium text-gray-900 dark:text-gray-100">{draft.name}</span>,
      },
      {
        key: "type",
        header: "Type",
        render: (draft) => <Badge color={TYPE_COLORS[draft.type]}>{TYPE_LABELS[draft.type]}</Badge>,
      },
      {
        key: "updatedAt",
        header: "Mis à jour le",
        render: (draft) => formatDateTime(draft.updatedAt ?? draft.createdAt),
      },
      {
        key: "actions",
        header: "Actions",
        render: (draft) => (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => openDraft(draft)}>
              Ouvrir
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeletingDraft(draft)}>
              Supprimer
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brouillons</h1>
      </div>

      <div className="flex items-center gap-2">
        {(["ALL", "CAMPAIGN", "TEMPLATE"] as TypeFilter[]).map((option) => (
          <Button
            key={option}
            variant={typeFilter === option ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTypeFilter(option)}
          >
            {option === "ALL" ? "Tous" : option === "CAMPAIGN" ? "Campagnes" : "Modèles"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="text-red-600 dark:text-red-400">Impossible de charger les brouillons.</p>
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
        title="Supprimer le brouillon"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer le brouillon « {deletingDraft?.name} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeletingDraft(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeMutation.isPending}
            onClick={() => deletingDraft && removeMutation.mutate(deletingDraft)}
          >
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
