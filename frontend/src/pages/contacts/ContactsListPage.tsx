import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as contactsApi from "../../api/contacts.api";
import type { CreateContactInput, ListContactsQuery, UpdateContactInput } from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { ContactWithTags, Genre } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../components/ui/ToastProvider";

type SortableField = NonNullable<ListContactsQuery["sortBy"]>;

const SORT_COLUMNS: Array<{ key: SortableField; label: string }> = [
  { key: "prenom", label: "Prénom" },
  { key: "nom", label: "Nom" },
  { key: "email", label: "Email" },
  { key: "entreprise", label: "Entreprise" },
  { key: "createdAt", label: "Créé le" },
];

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
    onError: () => showToast("Impossible de supprimer le contact", "error"),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Contacts</h1>
        <div className="flex gap-2">
          <Link to="/contacts/import">
            <Button variant="secondary">Importer</Button>
          </Link>
          <Button onClick={openCreateForm}>Ajouter un contact</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="input max-w-xs"
          placeholder="Rechercher un contact..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="input max-w-xs"
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
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm dark:border-brand-800 dark:bg-brand-900/30">
          <span className="font-medium text-brand-800 dark:text-brand-200">
            {selectionCount} contact(s) sélectionné(s)
          </span>
          {canSelectAllMatching && (
            <button
              type="button"
              className="text-brand-700 underline hover:text-brand-800 dark:text-brand-300"
              onClick={() => setSelectAllMatching(true)}
            >
              Sélectionner les {total} résultats de la recherche
            </button>
          )}
          <Button size="sm" onClick={openBulkModal}>
            Assigner à un groupe
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Tout désélectionner
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="text-red-600 dark:text-red-400">Impossible de charger les contacts.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                      checked={allPageSelected}
                      onChange={() => toggleSelectPage(pageIds)}
                      aria-label="Sélectionner tous les contacts de cette page"
                    />
                  </th>
                  {SORT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      {sortBy === column.key && (sortDir === "asc" ? " ▲" : " ▼")}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Genre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Ville
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Tags
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {(data?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      Aucun contact trouvé.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                          checked={selectAllMatching || selectedIds.has(contact.id)}
                          onChange={() => toggleRowSelection(contact.id)}
                          aria-label={`Sélectionner ${contact.nom}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link to={`/contacts/${contact.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                          {contact.prenom ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{contact.nom}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{contact.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {contact.entreprise ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {new Date(contact.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {contact.genre ? GENRE_LABELS[contact.genre] : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{contact.ville ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((tag) => (
                            <Badge key={tag.id} color="purple">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge color={contact.isUnsubscribed ? "red" : "green"}>
                          {contact.isUnsubscribed ? "Désinscrit" : "Actif"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditForm(contact)}>
                            Modifier
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeletingContact(contact)}>
                            Supprimer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>
              {rangeStart}–{rangeEnd} sur {total}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingContact ? "Modifier le contact" : "Ajouter un contact"}
      >
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="prenom">
                Prénom (optionnel)
              </label>
              <input
                id="prenom"
                className="input"
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
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
              {formErrors.nom && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.nom}</p>}
            </div>
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
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {formErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="entreprise">
                Entreprise
              </label>
              <input
                id="entreprise"
                className="input"
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
                value={form.fonction}
                onChange={(e) => setForm({ ...form, fonction: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="telephone">
                Téléphone
              </label>
              <input
                id="telephone"
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
                className="input"
                value={form.siteWeb}
                onChange={(e) => setForm({ ...form, siteWeb: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="adresse">
              Adresse
            </label>
            <input
              id="adresse"
              className="input"
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="codePostal">
                Code postal
              </label>
              <input
                id="codePostal"
                className="input"
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
                value={form.ville}
                onChange={(e) => setForm({ ...form, ville: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pays">
              Pays
            </label>
            <input
              id="pays"
              className="input"
              value={form.pays}
              onChange={(e) => setForm({ ...form, pays: e.target.value })}
            />
          </div>

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
                      onClick={() => toggleTagId(tag.id)}
                      className={
                        selected
                          ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
                          : "rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      }
                    >
                      {tag.name}
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">Aucun tag disponible.</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isUnsubscribed"
              type="checkbox"
              checked={form.isUnsubscribed}
              onChange={(e) => setForm({ ...form, isUnsubscribed: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            />
            <label className="text-sm text-gray-700 dark:text-gray-300" htmlFor="isUnsubscribed">
              Désinscrit
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeForm}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Enregistrement..." : editingContact ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={deletingContact !== null} onClose={() => setDeletingContact(null)} title="Supprimer le contact">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer «{" "}
          {deletingContact?.prenom ? `${deletingContact.prenom} ${deletingContact.nom}` : deletingContact?.nom} » ?
          Cette action est irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeletingContact(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeMutation.isPending}
            onClick={() => deletingContact && removeMutation.mutate(deletingContact.id)}
          >
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isBulkModalOpen} onClose={closeBulkModal} title="Assigner à un groupe">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {selectionCount} contact(s) seront ajoutés au groupe choisi, sans affecter leurs autres tags.
          </p>

          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                checked={bulkTagMode === "existing"}
                onChange={() => setBulkTagMode("existing")}
              />
              Groupe existant
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="radio" checked={bulkTagMode === "new"} onChange={() => setBulkTagMode("new")} />
              Nouveau groupe
            </label>
          </div>

          {bulkTagMode === "existing" ? (
            <select className="input" value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
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
              placeholder="Nom du nouveau groupe"
              value={bulkNewTagName}
              onChange={(e) => setBulkNewTagName(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeBulkModal}>
              Annuler
            </Button>
            <Button
              disabled={
                bulkTagMutation.isPending ||
                (bulkTagMode === "existing" ? !bulkTagId : !bulkNewTagName.trim())
              }
              onClick={() => bulkTagMutation.mutate()}
            >
              {bulkTagMutation.isPending ? "Assignation..." : "Assigner"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
