import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as usersApi from "../../api/users.api";
import type { CreateUserInput } from "../../api/users.api";
import type { Role, User } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Table, type TableColumn } from "../../components/ui/Table";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";

const ROLE_OPTIONS: Role[] = ["ADMIN", "USER"];

const ROLE_COLORS: Record<Role, BadgeColor> = {
  ADMIN: "purple",
  USER: "blue",
};

interface FormState {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}

const EMPTY_FORM: FormState = {
  email: "",
  password: "",
  fullName: "",
  role: "USER",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

function inputClass(hasError: boolean): string {
  return hasError ? "input border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500/60" : "input";
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast("Utilisateur créé", "success");
      closeForm();
    },
    onError: () => showToast("Impossible de créer l'utilisateur", "error"),
  });

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => usersApi.setActive(id, isActive),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast(variables.isActive ? "Utilisateur activé" : "Utilisateur désactivé", "success");
      setDeactivatingUser(null);
    },
    onError: () => showToast("Impossible de mettre à jour le statut de l'utilisateur", "error"),
  });

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setForm(EMPTY_FORM);
    setFormErrors({});
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.email.trim()) errors.email = "L'email est requis.";
    if (!form.fullName.trim()) errors.fullName = "Le nom complet est requis.";
    if (!form.password.trim() || form.password.length < 8) {
      errors.password = "Le mot de passe doit contenir au moins 8 caractères.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    createMutation.mutate({
      email: form.email.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      role: form.role,
    });
  }

  function handleToggleActive(user: User) {
    if (user.isActive) {
      setDeactivatingUser(user);
    } else {
      setActiveMutation.mutate({ id: user.id, isActive: true });
    }
  }

  const columns: TableColumn<User>[] = [
    {
      key: "email",
      header: "Email",
      render: (user) => (
        <div className="min-w-0 max-w-[11rem] min-[420px]:max-w-[13rem] sm:max-w-xs">
          <p className="truncate font-medium text-gray-900 dark:text-gray-100" title={user.email}>
            {user.email}
            {user.id === currentUser?.id && (
              <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">(vous)</span>
            )}
          </p>
          {/* Name shown under the email on phones, where its column is hidden. */}
          <p className="truncate text-xs text-gray-500 dark:text-gray-400 md:hidden">{user.fullName}</p>
        </div>
      ),
    },
    {
      key: "fullName",
      header: "Nom complet",
      hideBelow: "md",
      render: (user) => user.fullName,
    },
    {
      key: "role",
      header: "Rôle",
      render: (user) => <Badge color={ROLE_COLORS[user.role]}>{user.role}</Badge>,
    },
    {
      key: "isActive",
      header: "Statut",
      render: (user) => (
        <Badge dot color={user.isActive ? "green" : "gray"}>
          {user.isActive ? "Actif" : "Inactif"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Créé le",
      hideBelow: "lg",
      className: "whitespace-nowrap tabular-nums",
      render: (user) => formatDateTime(user.createdAt),
    },
    {
      key: "actions",
      header: <span className="sr-only sm:not-sr-only">Actions</span>,
      className: "text-right",
      render: (user) => (
        <Button
          type="button"
          variant={user.isActive ? "ghost" : "secondary"}
          size="sm"
          className={
            user.isActive
              ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              : undefined
          }
          disabled={setActiveMutation.isPending || user.id === currentUser?.id}
          onClick={() => handleToggleActive(user)}
        >
          {user.isActive ? "Désactiver" : "Activer"}
        </Button>
      ),
    },
  ];

  // Defense-in-depth: the router already gates this page behind AdminRoute,
  // but if it were ever reached without an admin session, render nothing
  // rather than the users table.
  if (currentUser?.role !== "ADMIN") {
    return null;
  }

  let listContent: JSX.Element;
  if (isLoading) {
    listContent = <LoadingState />;
  } else if (isError) {
    listContent = <ErrorState>Impossible de charger les utilisateurs.</ErrorState>;
  } else {
    listContent = (
      <Table
        columns={columns}
        rows={users ?? []}
        rowKey={(row) => row.id}
        emptyMessage="Aucun utilisateur trouvé."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description="Les personnes ayant accès à l'application et leur rôle."
        actions={
          <Button type="button" onClick={openCreateForm}>
            <Icon name="plus" className="h-4 w-4" />
            Créer un utilisateur
          </Button>
        }
      />

      {listContent}

      <Modal isOpen={isFormOpen} onClose={closeForm} title="Créer un utilisateur">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                className={inputClass(!!formErrors.email)}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <FieldError message={formErrors.email} />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="fullName">
                Nom complet
              </label>
              <input
                id="fullName"
                autoComplete="off"
                className={inputClass(!!formErrors.fullName)}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
              <FieldError message={formErrors.fullName} />
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
              {formErrors.password ? (
                <FieldError message={formErrors.password} />
              ) : (
                <p className="hint">8 caractères minimum.</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="role">
                Rôle
              </label>
              <select
                id="role"
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={createMutation.isPending}>
              Créer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deactivatingUser !== null}
        onClose={() => setDeactivatingUser(null)}
        size="sm"
        title="Désactiver l'utilisateur"
      >
        <p className="break-words text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment désactiver l'utilisateur « {deactivatingUser?.fullName} » ({deactivatingUser?.email}) ?
          Il ne pourra plus se connecter jusqu'à sa réactivation.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => setDeactivatingUser(null)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={setActiveMutation.isPending}
            onClick={() => deactivatingUser && setActiveMutation.mutate({ id: deactivatingUser.id, isActive: false })}
          >
            Désactiver
          </Button>
        </div>
      </Modal>
    </div>
  );
}
