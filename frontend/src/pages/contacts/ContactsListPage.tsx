import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import * as contactsApi from "../../api/contacts.api";
import type { CreateContactInput, ListContactsQuery, UpdateContactInput } from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { ContactWithTags, Genre } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";
import { extractErrorMessage } from "../campaigns/wizard/wizardForm";

type SortableField = NonNullable<ListContactsQuery["sortBy"]>;

const SORT_COLUMNS: Array<{ key: SortableField; label: string; hideBelow?: "sm" | "md" | "lg" }> = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom" },
  { key: "email", label: "Email" },
  { key: "entreprise", label: "Entreprise", hideBelow: "md" },
  { key: "createdAt", label: "Créé le", hideBelow: "lg" },
];

const HIDE_CLASSES = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

const TH_CLASS =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";
const TD_CLASS = "px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300";

const ERROR_CLASS = "mt-1.5 text-xs text-red-600 dark:text-red-400";

function tagChipClass(selected: boolean): string {
  return clsx(
    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
    selected
      ? "bg-brand-600 text-white ring-brand-600 shadow-sm hover:bg-brand-500 dark:bg-brand-500 dark:ring-brand-500"
      : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
  );
}

const PAGE_SIZE = 20;

const GENRE_LABELS: Record<Genre, string> = {
  HOMME: "Homme",
  FEMME: "Femme",
  AUTRE: "Autre",
};

interface FormState {
  prenom: string;
  nom: string;
  genre: Genre | "";
  email: string;
  entreprise: string;
  fonction: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  departement: string;
  region: string;
  pays: string;
  siteWeb: string;
  notes: string;
  tagIds: string[];
  isUnsubscribed: boolean;
}

const EMPTY_FORM: FormState = {
  prenom: "",
  nom: "",
  genre: "",
  email: "",
  entreprise: "",
  fonction: "",
  telephone: "",
  adresse: "",
  codePostal: "",
  ville: "",
  departement: "",
  region: "",
  pays: "",
  siteWeb: "",
  notes: "",
  tagIds: [],
  isUnsubscribed: false,
};

function contactToForm(contact: ContactWithTags): FormState {
  return {
    prenom: contact.prenom ?? "",
    nom: contact.nom,
    genre: contact.genre ?? "",
    email: contact.email,
    entreprise: contact.entreprise ?? "",
    fonction: contact.fonction ?? "",
    telephone: contact.telephone ?? "",
    adresse: contact.adresse ?? "",
    codePostal: contact.codePostal ?? "",
    ville: contact.ville ?? "",
    departement: contact.departement ?? "",
    region: contact.region ?? "",
    pays: contact.pays ?? "",
    siteWeb: contact.siteWeb ?? "",
    notes: contact.notes ?? "",
    tagIds: contact.tags.map((tag) => tag.id),
    isUnsubscribed: contact.isUnsubscribed,
  };
}

export default function ContactsListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortableField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tagId, setTagId] = useState<string>("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactWithTags | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deletingContact, setDeletingContact] = useState<ContactWithTags | null>(null);

  // Bulk group (tag) assignment. `selectAllMatching` means "every contact
  // matching the current search/tag/status filter", not just the ids
  // explicitly checked — needed to act on results beyond the current page
  // (e.g. assign a group to all 4000 contacts in a department) without
  // having to fetch every id into the browser first.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<"existing" | "new">("existing");
  const [bulkTagId, setBulkTagId] = useState("");
  const [bulkNewTagName, setBulkNewTagName] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query: ListContactsQuery = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    sortBy,
    sortDir,
    tagId: tagId || undefined,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contacts", query],
    queryFn: () => contactsApi.list(query),
  });

  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateContactInput) => contactsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact créé", "success");
      closeForm();
    },
    onError: () => showToast("Impossible de créer le contact", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input, tagIds }: { id: string; input: UpdateContactInput; tagIds: string[] }) => {
      await contactsApi.update(id, input);
      await contactsApi.setTags(id, tagIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact mis à jour", "success");
      closeForm();
    },
    onError: () => showToast("Impossible de mettre à jour le contact", "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => contactsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact supprimé", "success");
      setDeletingContact(null);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de supprimer le contact"), "error"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      contactsApi.bulkDelete(
        selectAllMatching
          ? { filter: { search: search || undefined, tagId: tagId || undefined } }
          : { contactIds: Array.from(selectedIds) }
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      const kept =
        result.skipped > 0
          ? ` ${result.skipped} conservé(s) car présent(s) dans une campagne en cours, en pause ou planifiée.`
          : "";
      showToast(`${result.deleted} contact(s) supprimé(s).${kept}`, result.skipped > 0 ? "info" : "success");
      setIsBulkDeleteOpen(false);
      clearSelection();
      setPage(1);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de supprimer les contacts"), "error"),
  });

  const bulkTagMutation = useMutation({
    mutationFn: async () => {
      let targetTagId = bulkTagId;
      if (bulkTagMode === "new") {
        const created = await tagsApi.create({ name: bulkNewTagName.trim() });
        targetTagId = created.id;
      }
      return contactsApi.bulkTag({
        tagId: targetTagId,
        action: "add",
        ...(selectAllMatching
          ? { filter: { search: search || undefined, tagId: tagId || undefined } }
          : { contactIds: Array.from(selectedIds) }),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      showToast(`${result.updated} contact(s) ajouté(s) au groupe`, "success");
      closeBulkModal();
      clearSelection();
    },
    onError: () => showToast("Impossible d'assigner le groupe", "error"),
  });

  function toggleRowSelection(id: string) {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectPage(pageIds: string[]) {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const allSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...pageIds]);
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }

  function openBulkModal() {
    setBulkTagMode("existing");
    setBulkTagId("");
    setBulkNewTagName("");
    setIsBulkModalOpen(true);
  }

  function closeBulkModal() {
    setIsBulkModalOpen(false);
  }

  function toggleSort(field: SortableField) {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function openCreateForm() {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setIsFormOpen(true);
  }

  function openEditForm(contact: ContactWithTags) {
    setEditingContact(contact);
    setForm(contactToForm(contact));
    setFormErrors({});
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  }

  function toggleTagId(id: string) {
    setForm((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(id) ? prev.tagIds.filter((t) => t !== id) : [...prev.tagIds, id],
    }));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!form.nom.trim()) errors.nom = "Le nom est requis.";
    if (!form.email.trim()) {
      errors.email = "L'email est requis.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = "L'email n'est pas valide.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    const payload = {
      prenom: form.prenom.trim() || null,
      nom: form.nom.trim(),
      genre: form.genre || null,
      email: form.email.trim(),
      entreprise: form.entreprise.trim() || null,
      fonction: form.fonction.trim() || null,
      telephone: form.telephone.trim() || null,
      adresse: form.adresse.trim() || null,
      codePostal: form.codePostal.trim() || null,
      ville: form.ville.trim() || null,
      departement: form.departement.trim() || null,
      region: form.region.trim() || null,
      pays: form.pays.trim() || null,
      siteWeb: form.siteWeb.trim() || null,
      notes: form.notes.trim() || null,
      isUnsubscribed: form.isUnsubscribed,
    };

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, input: payload, tagIds: form.tagIds });
    } else {
      createMutation.mutate({ ...payload, tagIds: form.tagIds });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const pageIds = data?.items.map((c) => c.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectionCount = selectAllMatching ? total : selectedIds.size;
  const canSelectAllMatching = allPageSelected && !selectAllMatching && total > pageIds.length;
  const hasFilters = Boolean(searchInput || tagId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Gérez votre carnet d'adresses, vos groupes et les désinscriptions."
        actions={
          <>
            <Link
              to="/contacts/import"
              className="btn h-10 border border-gray-300 bg-white px-4 text-sm text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              <Icon name="inbox" className="h-4 w-4" />
              Importer
            </Link>
            <Button type="button" onClick={openCreateForm}>
              <Icon name="plus" className="h-4 w-4" />
              Ajouter un contact
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative w-full sm:max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            className="input pl-9"
            placeholder="Rechercher un contact…"
            aria-label="Rechercher un contact"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className="input w-full sm:max-w-xs"
          aria-label="Filtrer par tag"
          value={tagId}
          onChange={(e) => {
            setTagId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les tags</option>
          {tags?.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>

      {selectionCount > 0 && (
        <div className="flex animate-fade-in flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-brand-800 dark:text-brand-200">
              {selectionCount} contact(s) sélectionné(s)
            </span>
            {canSelectAllMatching && (
              <button
                type="button"
                className="text-left font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
                onClick={() => setSelectAllMatching(true)}
              >
                Sélectionner les {total} résultats de la recherche
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={openBulkModal}>
              Assigner à un groupe
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={() => setIsBulkDeleteOpen(true)}>
              <Icon name="trash" className="h-4 w-4" />
              Supprimer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              Tout désélectionner
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Chargement des contacts…" />
      ) : isError ? (
        <ErrorState>Impossible de charger les contacts.</ErrorState>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <EmptyState
            icon="users"
            title="Aucun contact trouvé."
            description={
              hasFilters
                ? "Essayez de modifier votre recherche ou le filtre par tag."
                : "Ajoutez votre premier contact ou importez un fichier."
            }
            action={
              hasFilters ? undefined : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/contacts/import" className="link text-sm">
                    Importer un fichier
                  </Link>
                  <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
                    ·
                  </span>
                  <button type="button" className="link text-sm" onClick={openCreateForm}>
                    Ajouter un contact
                  </button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50/80 dark:bg-gray-800/40">
                  <tr>
                    <th scope="col" className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={() => toggleSelectPage(pageIds)}
                        aria-label="Sélectionner tous les contacts de cette page"
                      />
                    </th>
                    {SORT_COLUMNS.map((column) => {
                      const isSorted = sortBy === column.key;
                      return (
                        <th
                          key={column.key}
                          scope="col"
                          aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                          className={clsx(TH_CLASS, column.hideBelow && HIDE_CLASSES[column.hideBelow])}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key)}
                            className={clsx(
                              "group inline-flex items-center gap-1 rounded uppercase tracking-wider transition hover:text-gray-900 dark:hover:text-gray-100",
                              isSorted && "text-gray-900 dark:text-gray-100"
                            )}
                          >
                            {column.label}
                            <Icon
                              name="chevronDown"
                              className={clsx(
                                "h-3.5 w-3.5 transition",
                                isSorted ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                                isSorted && sortDir === "asc" && "rotate-180"
                              )}
                            />
                          </button>
                        </th>
                      );
                    })}
                    <th scope="col" className={clsx(TH_CLASS, HIDE_CLASSES.lg)}>
                      Genre
                    </th>
                    <th scope="col" className={clsx(TH_CLASS, HIDE_CLASSES.lg)}>
                      Ville
                    </th>
                    <th scope="col" className={clsx(TH_CLASS, HIDE_CLASSES.md)}>
                      Tags
                    </th>
                    <th scope="col" className={clsx(TH_CLASS, HIDE_CLASSES.sm)}>
                      Statut
                    </th>
                    <th scope="col" className={clsx(TH_CLASS, "text-right")}>
                      <span className="sr-only sm:not-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data?.items.map((contact) => {
                    const isSelected = selectAllMatching || selectedIds.has(contact.id);
                    return (
                      <tr
                        key={contact.id}
                        className={clsx(
                          "transition-colors",
                          isSelected
                            ? "bg-brand-50/60 dark:bg-brand-500/5"
                            : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                        )}
                      >
                        <td className={TD_CLASS}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(contact.id)}
                            aria-label={`Sélectionner ${contact.nom}`}
                          />
                        </td>
                        <td className={clsx(TD_CLASS, "whitespace-nowrap")}>
                          <Link to={`/contacts/${contact.id}`} className="link">
                            {contact.prenom ?? "—"}
                          </Link>
                        </td>
                        <td className={clsx(TD_CLASS, "whitespace-nowrap font-medium text-gray-900 dark:text-gray-100")}>
                          <Link
                            to={`/contacts/${contact.id}`}
                            className="hover:text-brand-600 hover:underline dark:hover:text-brand-400"
                          >
                            {contact.nom}
                          </Link>
                        </td>
                        <td className={TD_CLASS}>
                          <span className="block max-w-[14rem] truncate" title={contact.email}>
                            {contact.email}
                          </span>
                        </td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.md)}>
                          <span className="block max-w-[12rem] truncate" title={contact.entreprise ?? undefined}>
                            {contact.entreprise ?? "—"}
                          </span>
                        </td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.lg, "whitespace-nowrap tabular-nums")}>
                          {new Date(contact.createdAt).toLocaleDateString("fr-FR")}
                        </td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.lg)}>
                          {contact.genre ? GENRE_LABELS[contact.genre] : "—"}
                        </td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.lg)}>{contact.ville ?? "—"}</td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.md)}>
                          <div className="flex min-w-[8rem] flex-wrap gap-1">
                            {contact.tags.map((tag) => (
                              <Badge key={tag.id} color="purple">
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className={clsx(TD_CLASS, HIDE_CLASSES.sm)}>
                          <Badge dot color={contact.isUnsubscribed || contact.bouncedAt ? "red" : "green"}>
                            {contact.isUnsubscribed
                              ? "Désinscrit"
                              : contact.bouncedAt
                              ? "Adresse invalide"
                              : "Actif"}
                          </Badge>
                        </td>
                        <td className={clsx(TD_CLASS, "text-right")}>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(contact)}
                              aria-label={`Modifier ${contact.nom}`}
                            >
                              Modifier
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                              onClick={() => setDeletingContact(contact)}
                              aria-label={`Supprimer ${contact.nom}`}
                            >
                              <Icon name="trash" className="h-4 w-4" />
                              <span className="hidden sm:inline">Supprimer</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">
              {rangeStart}–{rangeEnd} sur {total}
              <span className="text-gray-400 dark:text-gray-500">
                {" "}
                · page {page}/{totalPages}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 sm:flex-none"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
                Précédent
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 sm:flex-none"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
                <Icon name="chevronRight" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        size="lg"
        title={editingContact ? "Modifier le contact" : "Ajouter un contact"}
        description="Seuls le nom et l'email sont obligatoires."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Identité
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="prenom">
                  Prénom (optionnel)
                </label>
                <input
                  id="prenom"
                  className="input"
                  autoComplete="given-name"
                  autoFocus
                  value={form.prenom}
                  onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="nom">
                  Nom
                </label>
                <input
                  id="nom"
                  className="input"
                  autoComplete="family-name"
                  aria-invalid={Boolean(formErrors.nom)}
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                />
                {formErrors.nom && <p className={ERROR_CLASS}>{formErrors.nom}</p>}
              </div>
              <div>
                <label className="label" htmlFor="genre">
                  Genre
                </label>
                <select
                  id="genre"
                  className="input"
                  value={form.genre}
                  onChange={(e) => setForm({ ...form, genre: e.target.value as Genre | "" })}
                >
                  <option value="">— Non précisé —</option>
                  {(Object.entries(GENRE_LABELS) as [Genre, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="input"
                  aria-invalid={Boolean(formErrors.email)}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {formErrors.email && <p className={ERROR_CLASS}>{formErrors.email}</p>}
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Coordonnées professionnelles
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="entreprise">
                  Entreprise
                </label>
                <input
                  id="entreprise"
                  className="input"
                  autoComplete="organization"
                  value={form.entreprise}
                  onChange={(e) => setForm({ ...form, entreprise: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="fonction">
                  Fonction
                </label>
                <input
                  id="fonction"
                  className="input"
                  autoComplete="organization-title"
                  value={form.fonction}
                  onChange={(e) => setForm({ ...form, fonction: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="telephone">
                  Téléphone
                </label>
                <input
                  id="telephone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="input"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="siteWeb">
                  Site internet
                </label>
                <input
                  id="siteWeb"
                  inputMode="url"
                  autoComplete="url"
                  className="input"
                  value={form.siteWeb}
                  onChange={(e) => setForm({ ...form, siteWeb: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Adresse
            </legend>
            <div>
              <label className="label" htmlFor="adresse">
                Adresse
              </label>
              <input
                id="adresse"
                className="input"
                autoComplete="street-address"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="codePostal">
                  Code postal
                </label>
                <input
                  id="codePostal"
                  className="input"
                  autoComplete="postal-code"
                  value={form.codePostal}
                  onChange={(e) => setForm({ ...form, codePostal: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="ville">
                  Ville
                </label>
                <input
                  id="ville"
                  className="input"
                  autoComplete="address-level2"
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="departement">
                  Département
                </label>
                <input
                  id="departement"
                  className="input"
                  value={form.departement}
                  onChange={(e) => setForm({ ...form, departement: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="region">
                  Région
                </label>
                <input
                  id="region"
                  className="input"
                  autoComplete="address-level1"
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="pays">
                  Pays
                </label>
                <input
                  id="pays"
                  className="input"
                  autoComplete="country-name"
                  value={form.pays}
                  onChange={(e) => setForm({ ...form, pays: e.target.value })}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Suivi
            </legend>
            <div>
              <label className="label" htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                className="input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div>
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-2">
                {tags?.length ? (
                  tags.map((tag) => {
                    const selected = form.tagIds.includes(tag.id);
                    return (
                      <button
                        type="button"
                        key={tag.id}
                        aria-pressed={selected}
                        onClick={() => toggleTagId(tag.id)}
                        className={tagChipClass(selected)}
                      >
                        {selected && <Icon name="check" className="-ml-0.5 mr-1 inline h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Aucun tag disponible.</p>
                )}
              </div>
            </div>

            <label
              htmlFor="isUnsubscribed"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
            >
              <input
                id="isUnsubscribed"
                type="checkbox"
                checked={form.isUnsubscribed}
                onChange={(e) => setForm({ ...form, isUnsubscribed: e.target.checked })}
              />
              Désinscrit
            </label>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={isSaving}>
              {editingContact ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deletingContact !== null}
        onClose={() => setDeletingContact(null)}
        size="sm"
        title="Supprimer le contact"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer «{" "}
          <span className="break-words font-medium text-gray-900 dark:text-gray-100">
            {deletingContact?.prenom ? `${deletingContact.prenom} ${deletingContact.nom}` : deletingContact?.nom}
          </span>{" "}
          » ? Cette action est irréversible.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setDeletingContact(null)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => deletingContact && removeMutation.mutate(deletingContact.id)}
          >
            Supprimer
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        size="sm"
        title={`Supprimer ${selectionCount} contact(s)`}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {selectAllMatching
              ? `Tous les contacts correspondant à la recherche actuelle (${selectionCount}) vont être supprimés.`
              : `Les ${selectionCount} contact(s) sélectionné(s) vont être supprimés.`}{" "}
            Cette action est irréversible.
          </p>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Leur historique d'envoi est aussi effacé (les totaux des campagnes restent inchangés). Les contacts
            présents dans une campagne en cours, en pause ou planifiée sont conservés.
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setIsBulkDeleteOpen(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={bulkDeleteMutation.isPending}
            onClick={() => bulkDeleteMutation.mutate()}
          >
            Supprimer définitivement
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={closeBulkModal}
        title="Assigner à un groupe"
        description={`${selectionCount} contact(s) seront ajoutés au groupe choisi, sans affecter leurs autres tags.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de groupe">
            {(
              [
                { value: "existing", label: "Groupe existant" },
                { value: "new", label: "Nouveau groupe" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={clsx(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition",
                  bulkTagMode === option.value
                    ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-brand-200"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/40"
                )}
              >
                <input
                  type="radio"
                  name="bulkTagMode"
                  checked={bulkTagMode === option.value}
                  onChange={() => setBulkTagMode(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>

          {bulkTagMode === "existing" ? (
            <select
              className="input"
              aria-label="Groupe existant"
              value={bulkTagId}
              onChange={(e) => setBulkTagId(e.target.value)}
            >
              <option value="">— Choisir un groupe —</option>
              {tags?.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              aria-label="Nom du nouveau groupe"
              placeholder="Nom du nouveau groupe"
              autoFocus
              value={bulkNewTagName}
              onChange={(e) => setBulkNewTagName(e.target.value)}
            />
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={closeBulkModal}>
              Annuler
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              loading={bulkTagMutation.isPending}
              disabled={bulkTagMode === "existing" ? !bulkTagId : !bulkNewTagName.trim()}
              onClick={() => bulkTagMutation.mutate()}
            >
              Assigner
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
