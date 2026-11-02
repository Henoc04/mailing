import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as templatesApi from "../../api/templates.api";
import type { Template } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Modèles d'emails</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gérez vos modèles réutilisables pour vos campagnes de mail-merge.
          </p>
        </div>
        <Link to="/templates/new">
          <Button>Nouveau modèle</Button>
        </Link>
      </div>

      {templatesQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>}
      {!templatesQuery.isLoading && templates.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aucun modèle pour le moment.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <div key={template.id} className="card flex flex-col">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{template.name}</h3>
              {template.isDraft && <Badge color="yellow">Brouillon</Badge>}
            </div>
            <p className="mb-2 truncate text-sm text-gray-500 dark:text-gray-400">{template.subject}</p>

            {/*
              Preview trusts the backend's sanitize-html pass applied to bodyHtml
              before persistence — bodyHtml is never re-sanitized client-side here.
            */}
            <div className="mb-3 h-32 overflow-hidden rounded-md border border-gray-200 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
              <div
                className="pointer-events-none"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: template.bodyHtml }}
              />
            </div>

            <div className="mt-auto flex flex-wrap gap-2">
              <Link to={`/templates/${template.id}`}>
                <Button variant="secondary" size="sm">
                  Modifier
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                disabled={duplicateMutation.isPending}
                onClick={() => duplicateMutation.mutate(template.id)}
              >
                Dupliquer
              </Button>
              <Button variant="danger" size="sm" onClick={() => setTemplateToDelete(template)}>
                Supprimer
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={!!templateToDelete} onClose={() => setTemplateToDelete(null)} title="Supprimer le modèle">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le modèle « {templateToDelete?.name} » ? Cette action est irréversible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTemplateToDelete(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeMutation.isPending}
            onClick={() => templateToDelete && removeMutation.mutate(templateToDelete.id)}
          >
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
