import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as smtpApi from "../../api/smtpAccounts.api";
import type { CreateSmtpAccountInput, UpdateSmtpAccountInput } from "../../api/smtpAccounts.api";
import type { SmtpAccount, SmtpSecurity } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Table, type TableColumn } from "../../components/ui/Table";
import { useToast } from "../../components/ui/ToastProvider";

const SECURITY_OPTIONS: SmtpSecurity[] = ["NONE", "SSL", "STARTTLS"];

interface FormState {
  label: string;
  host: string;
  port: string;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  rotationGroup: string;
  isActive: boolean;
  dailyQuota: string;
}

const EMPTY_FORM: FormState = {
  label: "",
  host: "",
  port: "587",
  security: "STARTTLS",
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
  rotationGroup: "",
  isActive: true,
  dailyQuota: "",
};

function accountToForm(account: SmtpAccount): FormState {
  return {
    label: account.label,
    host: account.host,
    port: String(account.port),
    security: account.security,
    username: account.username,
    password: "",
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    rotationGroup: account.rotationGroup ?? "",
    isActive: account.isActive,
    dailyQuota: account.dailyQuota != null ? String(account.dailyQuota) : "",
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Jamais testé";
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function SmtpAccountsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SmtpAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deletingAccount, setDeletingAccount] = useState<SmtpAccount | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: accounts, isLoading, isError } = useQuery({
    queryKey: ["smtp-accounts"],
    queryFn: smtpApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateSmtpAccountInput) => smtpApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      showToast("Compte SMTP créé", "success");
      closeForm();
    },
    onError: () => showToast("Impossible de créer le compte SMTP", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSmtpAccountInput }) => smtpApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      showToast("Compte SMTP mis à jour", "success");
      closeForm();
    },
    onError: () => showToast("Impossible de mettre à jour le compte SMTP", "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => smtpApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      showToast("Compte SMTP supprimé", "success");
      setDeletingAccount(null);
    },
    onError: () => showToast("Impossible de supprimer le compte SMTP", "error"),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => smtpApi.testConnection(id),
    onMutate: (id: string) => setTestingId(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["smtp-accounts"] });
      if (result.ok) {
        showToast("Connexion réussie", "success");
      } else {
        showToast(result.error ?? "Échec de la connexion", "error");
      }
    },
    onError: () => showToast("Impossible de tester la connexion", "error"),
    onSettled: () => setTestingId(null),
  });

  function openCreateForm() {
    setEditingAccount(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsFormOpen(true);
  }

  function openEditForm(account: SmtpAccount) {
    setEditingAccount(account);
    setForm(accountToForm(account));
    setFormErrors({});
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingAccount(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = "Le libellé est requis.";
    if (!form.host.trim()) errors.host = "L'hôte est requis.";

    const portNum = Number(form.port);
    if (!form.port.trim() || Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = "Le port doit être un nombre entre 1 et 65535.";
    }

    if (!form.username.trim()) errors.username = "Le nom d'utilisateur est requis.";
    if (!editingAccount && !form.password.trim()) errors.password = "Le mot de passe est requis.";
    if (!form.fromEmail.trim()) errors.fromEmail = "L'email d'expédition est requis.";
    if (!form.fromName.trim()) errors.fromName = "Le nom d'expéditeur est requis.";

    if (form.dailyQuota.trim()) {
      const quotaNum = Number(form.dailyQuota);
      if (Number.isNaN(quotaNum) || quotaNum < 0) {
        errors.dailyQuota = "Le quota doit être un nombre positif.";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    const basePayload = {
      label: form.label.trim(),
      host: form.host.trim(),
      port: Number(form.port),
      security: form.security,
      username: form.username.trim(),
      fromEmail: form.fromEmail.trim(),
      fromName: form.fromName.trim(),
      rotationGroup: form.rotationGroup.trim() ? form.rotationGroup.trim() : null,
      isActive: form.isActive,
      dailyQuota: form.dailyQuota.trim() ? Number(form.dailyQuota) : null,
    };

    if (editingAccount) {
      const updatePayload: UpdateSmtpAccountInput = { ...basePayload };
      if (form.password.trim()) {
        updatePayload.password = form.password.trim();
      }
      updateMutation.mutate({ id: editingAccount.id, input: updatePayload });
    } else {
      const createPayload: CreateSmtpAccountInput = {
        ...basePayload,
        password: form.password.trim(),
      };
      createMutation.mutate(createPayload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const columns: TableColumn<SmtpAccount>[] = [
    {
      key: "label",
      header: "Libellé",
      render: (account) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{account.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{account.fromEmail}</p>
        </div>
      ),
    },
    {
      key: "hostPort",
      header: "Hôte",
      render: (account) => (
        <span>
          {account.host}:{account.port}
        </span>
      ),
    },
    {
      key: "security",
      header: "Sécurité",
      render: (account) => <Badge color="blue">{account.security}</Badge>,
    },
    {
      key: "isActive",
      header: "Statut",
      render: (account) => (
        <Badge color={account.isActive ? "green" : "gray"}>{account.isActive ? "Actif" : "Inactif"}</Badge>
      ),
    },
    {
      key: "lastTest",
      header: "Dernier test",
      render: (account) => (
        <div className="flex flex-col gap-1">
          {account.lastTestOk === null ? (
            <Badge color="gray">Non testé</Badge>
          ) : account.lastTestOk ? (
            <Badge color="green">OK</Badge>
          ) : (
            <Badge color="red" className="max-w-[220px]">
              {account.lastTestError ?? "Échec"}
            </Badge>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(account.lastTestedAt)}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (account) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={testingId === account.id}
            onClick={() => testMutation.mutate(account.id)}
          >
            {testingId === account.id ? "Test..." : "Tester la connexion"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEditForm(account)}>
            Modifier
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeletingAccount(account)}>
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Comptes SMTP</h1>
        <Button onClick={openCreateForm}>Ajouter un compte SMTP</Button>
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="text-red-600 dark:text-red-400">Impossible de charger les comptes SMTP.</p>
      ) : (
        <Table
          columns={columns}
          rows={accounts ?? []}
          rowKey={(row) => row.id}
          emptyMessage="Aucun compte SMTP configuré."
        />
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingAccount ? "Modifier le compte SMTP" : "Ajouter un compte SMTP"}
      >
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="label" htmlFor="label">
              Libellé
            </label>
            <input
              id="label"
              className="input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            {formErrors.label && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.label}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="host">
                Hôte
              </label>
              <input
                id="host"
                className="input"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
              {formErrors.host && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.host}</p>}
            </div>
            <div>
              <label className="label" htmlFor="port">
                Port
              </label>
              <input
                id="port"
                className="input"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
              {formErrors.port && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.port}</p>}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="security">
              Sécurité
            </label>
            <select
              id="security"
              className="input"
              value={form.security}
              onChange={(e) => setForm({ ...form, security: e.target.value as SmtpSecurity })}
            >
              {SECURITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="username">
                Nom d'utilisateur
              </label>
              <input
                id="username"
                className="input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              {formErrors.username && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.username}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="password">
                Mot de passe {editingAccount && "(laisser vide pour ne pas changer)"}
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {formErrors.password && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.password}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="fromEmail">
                Email d'expédition
              </label>
              <input
                id="fromEmail"
                type="email"
                className="input"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
              />
              {formErrors.fromEmail && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.fromEmail}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="fromName">
                Nom d'expéditeur
              </label>
              <input
                id="fromName"
                className="input"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              />
              {formErrors.fromName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.fromName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rotationGroup">
                Groupe de rotation (optionnel)
              </label>
              <input
                id="rotationGroup"
                className="input"
                value={form.rotationGroup}
                onChange={(e) => setForm({ ...form, rotationGroup: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="dailyQuota">
                Quota quotidien (optionnel)
              </label>
              <input
                id="dailyQuota"
                className="input"
                value={form.dailyQuota}
                onChange={(e) => setForm({ ...form, dailyQuota: e.target.value })}
              />
              {formErrors.dailyQuota && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.dailyQuota}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            />
            <label className="text-sm text-gray-700 dark:text-gray-300" htmlFor="isActive">
              Compte actif
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Enregistrement..." : editingAccount ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deletingAccount !== null}
        onClose={() => setDeletingAccount(null)}
        title="Supprimer le compte SMTP"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer le compte « {deletingAccount?.label} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeletingAccount(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeMutation.isPending}
            onClick={() => deletingAccount && removeMutation.mutate(deletingAccount.id)}
          >
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
