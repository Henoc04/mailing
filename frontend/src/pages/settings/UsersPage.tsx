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
      render: (user) => <span className="font-medium text-gray-900 dark:text-gray-100">{user.email}</span>,
    },
    {
      key: "fullName",
      header: "Nom complet",
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
        <Badge color={user.isActive ? "green" : "gray"}>{user.isActive ? "Actif" : "Inactif"}</Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Créé le",
      render: (user) => formatDateTime(user.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user) => (
        <Button
          variant={user.isActive ? "danger" : "secondary"}
          size="sm"
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
    listContent = <p className="text-gray-500 dark:text-gray-400">Chargement...</p>;
  } else if (isError) {
    listContent = <p className="text-red-600 dark:text-red-400">Impossible de charger les utilisateurs.</p>;
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Utilisateurs</h1>
        <Button onClick={openCreateForm}>Créer un utilisateur</Button>
      </div>

      {listContent}

      <Modal isOpen={isFormOpen} onClose={closeForm} title="Créer un utilisateur">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {formErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.email}</p>}
          </div>

          <div>
            <label className="label" htmlFor="fullName">
              Nom complet
            </label>
            <input
              id="fullName"
              className="input"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
            {formErrors.fullName && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.fullName}</p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="password">
              Mot de passe
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Création..." : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deactivatingUser !== null}
        onClose={() => setDeactivatingUser(null)}
        title="Désactiver l'utilisateur"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment désactiver l'utilisateur « {deactivatingUser?.fullName} » ({deactivatingUser?.email}
          ) ? Il ne pourra plus se connecter jusqu'à sa réactivation.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeactivatingUser(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={setActiveMutation.isPending}
            onClick={() => deactivatingUser && setActiveMutation.mutate({ id: deactivatingUser.id, isActive: false })}
          >
            {setActiveMutation.isPending ? "Désactivation..." : "Désactiver"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
