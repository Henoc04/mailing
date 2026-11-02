import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as templatesApi from "../../api/templates.api";
import type { Template } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";

const PRIMARY_LINK_CLASSES = "btn h-10 bg-brand-600 px-4 text-sm text-white shadow-sm hover:bg-brand-500";
const SECONDARY_LINK_SM_CLASSES =
  "btn h-8 border border-gray-300 bg-white px-3 text-xs text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800";

export default function TemplatesListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: templatesApi.list });
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const duplicateMutation = useMutation({
    mutationFn: templatesApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast("Modèle dupliqué.", "success");
    },
    onError: () => showToast("Impossible de dupliquer le modèle.", "error"),
  });

  const removeMutation = useMutation({
    mutationFn: templatesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast("Modèle supprimé.", "success");
    },
    onError: () => showToast("Impossible de supprimer le modèle.", "error"),
    onSettled: () => setTemplateToDelete(null),
  });

  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modèles d'emails"
        description="Gérez vos modèles réutilisables pour vos campagnes de mail-merge."
        actions={
          <Link to="/templates/new" className={PRIMARY_LINK_CLASSES}>
            <Icon name="plus" className="h-4 w-4" />
            Nouveau modèle
          </Link>
        }
      />

      {templatesQuery.isLoading && <LoadingState />}
      {templatesQuery.isError && <ErrorState>Impossible de charger les modèles.</ErrorState>}
      {!templatesQuery.isLoading && !templatesQuery.isError && templates.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <EmptyState
            icon="template"
            title="Aucun modèle pour le moment."
            description="Créez un modèle pour réutiliser facilement vos contenus dans vos campagnes."
            action={
              <Link to="/templates/new" className={PRIMARY_LINK_CLASSES}>
                <Icon name="plus" className="h-4 w-4" />
                Nouveau modèle
              </Link>
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="card flex min-w-0 flex-col overflow-hidden p-0 transition hover:shadow-lift sm:p-0"
          >
            {/*
              Preview trusts the backend's sanitize-html pass applied to bodyHtml
              before persistence — bodyHtml is never re-sanitized client-side here.
            */}
            <Link
              to={`/templates/${template.id}`}
              className="relative block h-36 overflow-hidden border-b border-gray-100 bg-white p-3 text-xs text-gray-900 dark:border-gray-800"
              aria-label={`Modifier le modèle ${template.name}`}
            >
              <div
                className="pointer-events-none origin-top-left break-words"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: template.bodyHtml }}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
            </Link>

            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold text-gray-900 dark:text-gray-100" title={template.name}>
                  {template.name}
                </h3>
                {template.isDraft && (
                  <Badge dot color="yellow" className="shrink-0">
                    Brouillon
                  </Badge>
                )}
              </div>
              <p className="mb-4 truncate text-sm text-gray-500 dark:text-gray-400" title={template.subject}>
                {template.subject}
              </p>

              <div className="mt-auto flex flex-wrap gap-2">
                <Link to={`/templates/${template.id}`} className={SECONDARY_LINK_SM_CLASSES}>
                  Modifier
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate(template.id)}
                >
                  Dupliquer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  onClick={() => setTemplateToDelete(template)}
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Supprimer
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!templateToDelete} onClose={() => setTemplateToDelete(null)} size="sm" title="Supprimer le modèle">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le modèle « {templateToDelete?.name} » ? Cette action est irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => setTemplateToDelete(null)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => templateToDelete && removeMutation.mutate(templateToDelete.id)}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
