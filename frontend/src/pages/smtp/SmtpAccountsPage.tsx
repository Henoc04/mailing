import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as smtpApi from "../../api/smtpAccounts.api";
import type { CreateSmtpAccountInput, UpdateSmtpAccountInput } from "../../api/smtpAccounts.api";
import type { SmtpAccount, SmtpSecurity } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../../components/ui/States";
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

function inputClass(hasError: boolean): string {
  return hasError ? "input border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500/60" : "input";
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

  function renderAccountCard(account: SmtpAccount) {
    const isTesting = testingId === account.id;

    return (
      <article key={account.id} className="card flex min-w-0 flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Icon name="server" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-gray-900 dark:text-gray-100" title={account.label}>
              {account.label}
            </h3>
            <p className="truncate text-sm text-gray-500 dark:text-gray-400" title={account.fromEmail}>
              {account.fromEmail}
            </p>
          </div>
          <Badge dot color={account.isActive ? "green" : "gray"} className="shrink-0">
            {account.isActive ? "Actif" : "Inactif"}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm min-[420px]:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">Hôte</dt>
            <dd className="mt-0.5 break-all font-mono text-[13px] text-gray-800 dark:text-gray-200">
              {account.host}:{account.port}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">Sécurité</dt>
            <dd className="mt-0.5">
              <Badge color="blue">{account.security}</Badge>
            </dd>
          </div>
          {account.rotationGroup && (
            <div className="min-w-0">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Groupe de rotation</dt>
              <dd className="mt-0.5 truncate text-gray-800 dark:text-gray-200">{account.rotationGroup}</dd>
            </div>
          )}
          {account.dailyQuota != null && (
            <div className="min-w-0">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Quota quotidien</dt>
              <dd className="mt-0.5 tabular-nums text-gray-800 dark:text-gray-200">
                {account.dailyQuota.toLocaleString("fr-FR")}
              </dd>
            </div>
          )}
        </dl>

        <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Dernier test</span>
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {formatDate(account.lastTestedAt)}
            </span>
          </div>
          <div className="mt-2">
            {account.lastTestOk === null ? (
              <Badge dot color="gray">
                Non testé
              </Badge>
            ) : account.lastTestOk ? (
              <Badge dot color="green">
                OK
              </Badge>
            ) : (
              <div className="space-y-1.5">
                <Badge dot color="red">
                  Échec
                </Badge>
                <p className="break-words text-xs text-red-700 dark:text-red-300">
                  {account.lastTestError ?? "Échec"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            loading={isTesting}
            onClick={() => testMutation.mutate(account.id)}
          >
            {!isTesting && <Icon name="bolt" className="h-4 w-4" />}
            Tester la connexion
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => openEditForm(account)}>
            Modifier
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            onClick={() => setDeletingAccount(account)}
          >
            <Icon name="trash" className="h-4 w-4" />
            Supprimer
          </Button>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes SMTP"
        description="Les comptes d'envoi utilisés par vos campagnes."
        actions={
          <Button type="button" onClick={openCreateForm}>
            <Icon name="plus" className="h-4 w-4" />
            Ajouter un compte SMTP
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>Impossible de charger les comptes SMTP.</ErrorState>
      ) : (accounts ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <EmptyState
            icon="server"
            title="Aucun compte SMTP configuré."
            description="Ajoutez un compte d'envoi pour pouvoir lancer vos campagnes."
            action={
              <Button type="button" onClick={openCreateForm}>
                <Icon name="plus" className="h-4 w-4" />
                Ajouter un compte SMTP
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {(accounts ?? []).map(renderAccountCard)}
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        size="lg"
        title={editingAccount ? "Modifier le compte SMTP" : "Ajouter un compte SMTP"}
        description="Paramètres de connexion fournis par votre hébergeur ou service d'emailing."
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="label">
                Libellé
              </label>
              <input
                id="label"
                className={inputClass(!!formErrors.label)}
                autoFocus
                placeholder="Ex : Serveur principal"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
              <FieldError message={formErrors.label} />
            </div>
          </div>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Serveur
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
              <div>
                <label className="label" htmlFor="host">
                  Hôte
                </label>
                <input
                  id="host"
                  className={inputClass(!!formErrors.host)}
                  placeholder="smtp.exemple.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
                <FieldError message={formErrors.host} />
              </div>
              <div>
                <label className="label" htmlFor="port">
                  Port
                </label>
                <input
                  id="port"
                  inputMode="numeric"
                  className={inputClass(!!formErrors.port)}
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
                <FieldError message={formErrors.port} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="hidden sm:block" aria-hidden="true" />
              <div>
                <label className="label" htmlFor="username">
                  Nom d'utilisateur
                </label>
                <input
                  id="username"
                  className={inputClass(!!formErrors.username)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <FieldError message={formErrors.username} />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className={inputClass(!!formErrors.password)}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                {editingAccount && <p className="hint">(laisser vide pour ne pas changer)</p>}
                <FieldError message={formErrors.password} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-800">
            <legend className="sr-only">Expéditeur et envoi</legend>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Expéditeur et envoi
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fromEmail">
                  Email d'expédition
                </label>
                <input
                  id="fromEmail"
                  type="email"
                  autoCapitalize="none"
                  className={inputClass(!!formErrors.fromEmail)}
                  value={form.fromEmail}
                  onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                />
                <FieldError message={formErrors.fromEmail} />
              </div>
              <div>
                <label className="label" htmlFor="fromName">
                  Nom d'expéditeur
                </label>
                <input
                  id="fromName"
                  className={inputClass(!!formErrors.fromName)}
                  value={form.fromName}
                  onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                />
                <FieldError message={formErrors.fromName} />
              </div>
              <div>
                <label className="label" htmlFor="rotationGroup">
                  Groupe de rotation <span className="font-normal text-gray-400">(optionnel)</span>
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
                  Quota quotidien <span className="font-normal text-gray-400">(optionnel)</span>
                </label>
                <input
                  id="dailyQuota"
                  inputMode="numeric"
                  className={inputClass(!!formErrors.dailyQuota)}
                  value={form.dailyQuota}
                  onChange={(e) => setForm({ ...form, dailyQuota: e.target.value })}
                />
                <FieldError message={formErrors.dailyQuota} />
              </div>
            </div>
          </fieldset>

          <label
            htmlFor="isActive"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
          >
            <input
              id="isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Compte actif
          </label>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={isSaving}>
              {editingAccount ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deletingAccount !== null}
        onClose={() => setDeletingAccount(null)}
        size="sm"
        title="Supprimer le compte SMTP"
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le compte « {deletingAccount?.label} » ? Cette action est
          irréversible.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => setDeletingAccount(null)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => deletingAccount && removeMutation.mutate(deletingAccount.id)}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
