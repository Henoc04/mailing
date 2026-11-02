import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tagsApi from "../../api/tags.api";
import * as segmentsApi from "../../api/segments.api";
import * as contactsApi from "../../api/contacts.api";
import type { CreateSegmentInput } from "../../api/segments.api";
import type { Genre, Segment, SegmentFilterMode, SegmentFilterRule, Tag } from "../../api/types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";

// ---- Filter allow-list --------------------------------------------------
// This mirrors backend/src/services/segment.service.ts's compileFilterToWhere
// EXACTLY. Only these fields/operators are accepted by the backend — anything
// else throws a ValidationError, so the UI must not allow constructing
// anything outside this allow-list.

type FilterField =
  | "prenom"
  | "nom"
  | "genre"
  | "email"
  | "entreprise"
  | "fonction"
  | "adresse"
  | "codePostal"
  | "ville"
  | "departement"
  | "region"
  | "pays"
  | "siteWeb"
  | "tagIds"
  | "isUnsubscribed";

const FIELD_OPTIONS: { value: FilterField; label: string }[] = [
  { value: "prenom", label: "Prénom" },
  { value: "nom", label: "Nom" },
  { value: "genre", label: "Genre" },
  { value: "email", label: "Email" },
  { value: "entreprise", label: "Entreprise" },
  { value: "fonction", label: "Fonction" },
  { value: "adresse", label: "Adresse" },
  { value: "codePostal", label: "Code postal" },
  { value: "ville", label: "Ville" },
  { value: "departement", label: "Département" },
  { value: "region", label: "Région" },
  { value: "pays", label: "Pays" },
  { value: "siteWeb", label: "Site internet" },
  { value: "tagIds", label: "Tags" },
  { value: "isUnsubscribed", label: "Désabonné" },
];

const GENRE_VALUE_LABELS: Record<Genre, string> = {
  HOMME: "Homme",
  FEMME: "Femme",
  AUTRE: "Autre",
};

// Mirrors backend/src/services/segment.service.ts's "genre" special-case:
// a MySQL/Prisma enum column only supports equals/not/in, never "contains".
const GENRE_OPERATOR_OPTIONS: { value: "eq" | "notEq" | "in"; label: string }[] = [
  { value: "eq", label: "est" },
  { value: "notEq", label: "n'est pas" },
  { value: "in", label: "est parmi" },
];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_OPTIONS.map((f) => [f.value, f.label])
);

type StringOperator = "eq" | "contains" | "in" | "notEq";

const STRING_OPERATOR_OPTIONS: { value: StringOperator; label: string }[] = [
  { value: "eq", label: "est égal à" },
  { value: "contains", label: "contient" },
  { value: "in", label: "est parmi" },
  { value: "notEq", label: "n'est pas" },
];

const TAG_OPERATOR_OPTIONS: { value: "in"; label: string }[] = [{ value: "in", label: "est parmi" }];

const UNSUBSCRIBED_OPERATOR_OPTIONS: { value: "eq" | "notEq"; label: string }[] = [
  { value: "eq", label: "est" },
  { value: "notEq", label: "n'est pas" },
];

const OPERATOR_LABELS: Record<string, string> = {
  eq: "est égal à",
  contains: "contient",
  in: "est parmi",
  notEq: "n'est pas",
};

function operatorOptionsForField(field: string): { value: string; label: string }[] {
  if (field === "tagIds") return TAG_OPERATOR_OPTIONS;
  if (field === "isUnsubscribed") return UNSUBSCRIBED_OPERATOR_OPTIONS;
  if (field === "genre") return GENRE_OPERATOR_OPTIONS;
  return STRING_OPERATOR_OPTIONS;
}

function defaultOperatorForField(field: string): string {
  return operatorOptionsForField(field)[0].value;
}

function defaultValueForField(field: string): unknown {
  if (field === "tagIds") return [];
  if (field === "isUnsubscribed") return false;
  if (field === "genre") return "";
  return "";
}

// A local editable row shape. `value` is kept loosely typed while editing —
// it's coerced into the correct shape (array/boolean/string) right before
// building the submit payload.
interface EditableRule {
  field: FilterField;
  operator: string;
  value: unknown;
}

function emptyRule(): EditableRule {
  return { field: "prenom", operator: "eq", value: "" };
}

function summarizeRule(rule: SegmentFilterRule, tagsById: Map<string, Tag>): string {
  const fieldLabel = FIELD_LABELS[rule.field] ?? rule.field;

  if (rule.field === "tagIds") {
    const ids = Array.isArray(rule.value) ? (rule.value as string[]) : [];
    const names = ids.map((id) => tagsById.get(id)?.name ?? id);
    return `${fieldLabel} ∈ {${names.join(", ")}}`;
  }

  if (rule.field === "isUnsubscribed") {
    const opLabel = rule.operator === "notEq" ? "n'est pas" : "est";
    return `${fieldLabel} ${opLabel} ${rule.value ? "Oui" : "Non"}`;
  }

  if (rule.field === "genre") {
    const genreLabel = (v: unknown): string => GENRE_VALUE_LABELS[v as Genre] ?? String(v);
    const opLabel = rule.operator === "notEq" ? "n'est pas" : rule.operator === "in" ? "est parmi" : "est";
    if (Array.isArray(rule.value)) {
      return `${fieldLabel} ${opLabel} {${(rule.value as unknown[]).map(genreLabel).join(", ")}}`;
    }
    return `${fieldLabel} ${opLabel} ${genreLabel(rule.value)}`;
  }

  const opLabel = OPERATOR_LABELS[rule.operator] ?? rule.operator;
  const stringify = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v));
  if (Array.isArray(rule.value)) {
    return `${fieldLabel} ${opLabel} {${(rule.value as unknown[]).map(stringify).join(", ")}}`;
  }
  return `${fieldLabel} ${opLabel} "${stringify(rule.value)}"`;
}

function summarizeSegment(segment: Segment, tagsById: Map<string, Tag>): string {
  if (segment.filterJson.length === 0) return "Aucune règle";
  const joiner = segment.filterMode === "AND" ? " ET " : " OU ";
  return segment.filterJson.map((rule) => summarizeRule(rule, tagsById)).join(joiner);
}

const MEMBERS_PAGE_SIZE = 20;

// Dedicated view for a single group (tag): a paginated member list (backed
// by the existing `contacts.list({ tagId })` filter, so it scales to
// thousands of members) with per-row removal, plus a small search-and-add
// widget to attach more contacts without leaving this modal.
function GroupMembersModal({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [addSearchInput, setAddSearchInput] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(1);
    setAddSearchInput("");
    setAddSearch("");
    setSelectedToAdd(new Set());
  }, [tag?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => setAddSearch(addSearchInput), 300);
    return () => clearTimeout(timeout);
  }, [addSearchInput]);

  const membersQuery = useQuery({
    queryKey: ["contacts", "by-tag", tag?.id, page],
    queryFn: () => contactsApi.list({ tagId: tag!.id, page, pageSize: MEMBERS_PAGE_SIZE }),
    enabled: !!tag,
  });

  const searchQuery = useQuery({
    queryKey: ["contacts", "search-to-add", addSearch],
    queryFn: () => contactsApi.list({ search: addSearch, pageSize: 10 }),
    enabled: !!tag && addSearch.trim().length > 0,
  });

  const removeMutation = useMutation({
    mutationFn: (contactId: string) =>
      contactsApi.bulkTag({ tagId: tag!.id, action: "remove", contactIds: [contactId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", "by-tag", tag?.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact retiré du groupe", "success");
    },
    onError: () => showToast("Impossible de retirer ce contact", "error"),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      contactsApi.bulkTag({ tagId: tag!.id, action: "add", contactIds: Array.from(selectedToAdd) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", "by-tag", tag?.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast(`${result.updated} contact(s) ajouté(s)`, "success");
      setSelectedToAdd(new Set());
      setAddSearchInput("");
      setAddSearch("");
    },
    onError: () => showToast("Impossible d'ajouter ces contacts", "error"),
  });

  function toggleSelectedToAdd(id: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!tag) return null;

  const total = membersQuery.data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / MEMBERS_PAGE_SIZE) : 1;

  return (
    <Modal isOpen={!!tag} onClose={onClose} title={`Membres du groupe « ${tag.name} »`}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">{total} membre(s)</p>
          {membersQuery.isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>
          ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun membre pour le moment.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-gray-200 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {membersQuery.data?.items.map((contact) => (
                <li key={contact.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    {contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom}{" "}
                    <span className="text-xs text-gray-400 dark:text-gray-500">({contact.email})</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(contact.id)}
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <span>
                Page {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
          <p className="label">Ajouter des contacts</p>
          <input
            className="input"
            placeholder="Rechercher un contact par nom, email..."
            value={addSearchInput}
            onChange={(e) => setAddSearchInput(e.target.value)}
          />

          {addSearch.trim() && (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
              {searchQuery.isLoading ? (
                <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Recherche...</p>
              ) : (searchQuery.data?.items.length ?? 0) === 0 ? (
                <p className="p-2 text-sm text-gray-500 dark:text-gray-400">Aucun contact trouvé.</p>
              ) : (
                searchQuery.data?.items.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                      checked={selectedToAdd.has(contact.id)}
                      onChange={() => toggleSelectedToAdd(contact.id)}
                    />
                    <span className="text-gray-700 dark:text-gray-200">
                      {contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom} ({contact.email})
                    </span>
                  </label>
                ))
              )}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={selectedToAdd.size === 0 || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? "Ajout..." : `Ajouter la sélection (${selectedToAdd.size})`}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function SegmentsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: tagsApi.list });
  const segmentsQuery = useQuery({ queryKey: ["segments"], queryFn: segmentsApi.list });

  const tagsById = useMemo(() => {
    const map = new Map<string, Tag>();
    for (const tag of tagsQuery.data ?? []) map.set(tag.id, tag);
    return map;
  }, [tagsQuery.data]);

  // ---- Tag management ----
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
  const [viewingTag, setViewingTag] = useState<Tag | null>(null);

  const createTagMutation = useMutation({
    mutationFn: tagsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setNewTagName("");
      setNewTagColor("#3b82f6");
      showToast("Tag créé avec succès.", "success");
    },
    onError: () => showToast("Impossible de créer le tag.", "error"),
  });

  const removeTagMutation = useMutation({
    mutationFn: tagsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      showToast("Tag supprimé.", "success");
    },
    onError: () => showToast("Impossible de supprimer le tag.", "error"),
    onSettled: () => setTagToDelete(null),
  });

  function handleCreateTag(event: FormEvent) {
    event.preventDefault();
    if (!newTagName.trim()) {
      showToast("Le nom du tag est requis.", "error");
      return;
    }
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  }

  // ---- Segment CRUD ----
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFilterMode, setFormFilterMode] = useState<SegmentFilterMode>("AND");
  const [formRules, setFormRules] = useState<EditableRule[]>([emptyRule()]);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreateModal() {
    setEditingSegment(null);
    setFormName("");
    setFormDescription("");
    setFormFilterMode("AND");
    setFormRules([emptyRule()]);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(segment: Segment) {
    setEditingSegment(segment);
    setFormName(segment.name);
    setFormDescription(segment.description ?? "");
    setFormFilterMode(segment.filterMode);
    setFormRules(
      segment.filterJson.length > 0
        ? segment.filterJson.map((rule) => ({ field: rule.field as FilterField, operator: rule.operator, value: rule.value }))
        : [emptyRule()]
    );
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  function updateRule(index: number, patch: Partial<EditableRule>) {
    setFormRules((prev) => prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function handleFieldChange(index: number, field: FilterField) {
    updateRule(index, {
      field,
      operator: defaultOperatorForField(field),
      value: defaultValueForField(field),
    });
  }

  function addRule() {
    setFormRules((prev) => [...prev, emptyRule()]);
  }

  function removeRule(index: number) {
    setFormRules((prev) => prev.filter((_, i) => i !== index));
  }

  const segmentMutation = useMutation({
    mutationFn: async (input: CreateSegmentInput) => {
      if (editingSegment) {
        return segmentsApi.update(editingSegment.id, input);
      }
      return segmentsApi.create(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      showToast(editingSegment ? "Segment mis à jour." : "Segment créé.", "success");
      setIsModalOpen(false);
    },
    onError: () => showToast("Impossible d'enregistrer le segment.", "error"),
  });

  const removeSegmentMutation = useMutation({
    mutationFn: segmentsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      showToast("Segment supprimé.", "success");
    },
    onError: () => showToast("Impossible de supprimer le segment.", "error"),
    onSettled: () => setSegmentToDelete(null),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Le nom du segment est requis.");
      return;
    }

    if (formRules.length === 0) {
      setFormError("Un segment doit avoir au moins une règle.");
      return;
    }

    const filterJson: SegmentFilterRule[] = [];
    for (const rule of formRules) {
      if (rule.field === "tagIds") {
        const value = Array.isArray(rule.value) ? (rule.value as string[]) : [];
        if (value.length === 0) {
          setFormError("Chaque règle « Tags » doit sélectionner au moins un tag.");
          return;
        }
        filterJson.push({ field: "tagIds", operator: "in", value });
      } else if (rule.field === "isUnsubscribed") {
        filterJson.push({ field: "isUnsubscribed", operator: rule.operator, value: Boolean(rule.value) });
      } else if (rule.field === "genre") {
        if (rule.operator === "in") {
          const value = Array.isArray(rule.value) ? (rule.value as string[]) : [];
          if (value.length === 0) {
            setFormError('Chaque règle « Genre » avec "est parmi" doit sélectionner au moins une valeur.');
            return;
          }
          filterJson.push({ field: "genre", operator: "in", value });
        } else {
          if (!rule.value) {
            setFormError("Chaque règle « Genre » doit avoir une valeur.");
            return;
          }
          filterJson.push({ field: "genre", operator: rule.operator, value: rule.value });
        }
      } else if (rule.operator === "in") {
        const raw = String(rule.value ?? "");
        const value = raw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        if (value.length === 0) {
          setFormError(`La règle « ${FIELD_LABELS[rule.field]} » doit contenir au moins une valeur.`);
          return;
        }
        filterJson.push({ field: rule.field, operator: "in", value });
      } else {
        const value = String(rule.value ?? "").trim();
        if (!value) {
          setFormError(`La règle « ${FIELD_LABELS[rule.field]} » doit avoir une valeur.`);
          return;
        }
        filterJson.push({ field: rule.field, operator: rule.operator, value });
      }
    }

    segmentMutation.mutate({
      name: formName.trim(),
      description: formDescription.trim() ? formDescription.trim() : null,
      filterMode: formFilterMode,
      filterJson,
    });
  }

  const tags = tagsQuery.data ?? [];
  const segments = segmentsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Segments &amp; tags</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gérez vos tags de contacts et construisez des segments dynamiques pour vos campagnes.
        </p>
      </div>

      {/* ---- Tags panel ---- */}
      <section className="card">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">Gestion des tags</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Cliquez sur le nom d'un groupe pour voir ses membres, en ajouter ou en retirer.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {tagsQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>}
          {!tagsQuery.isLoading && tags.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun tag pour le moment.</p>
          )}
          {tags.map((tag) =>
            tag.color ? (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
              >
                <button type="button" onClick={() => setViewingTag(tag)} className="hover:underline">
                  {tag.name}
                </button>
                <button
                  type="button"
                  onClick={() => setTagToDelete(tag)}
                  className="text-current opacity-60 hover:opacity-100"
                  aria-label={`Supprimer le tag ${tag.name}`}
                >
                  &times;
                </button>
              </span>
            ) : (
              <Badge key={tag.id} color="gray" className="gap-1.5">
                <button type="button" onClick={() => setViewingTag(tag)} className="hover:underline">
                  {tag.name}
                </button>
                <button
                  type="button"
                  onClick={() => setTagToDelete(tag)}
                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label={`Supprimer le tag ${tag.name}`}
                >
                  &times;
                </button>
              </Badge>
            )
          )}
        </div>

        <form onSubmit={handleCreateTag} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor="new-tag-name" className="label">
              Nouveau tag
            </label>
            <input
              id="new-tag-name"
              type="text"
              className="input"
              placeholder="Ex : Prospects"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-tag-color" className="label">
              Couleur
            </label>
            <input
              id="new-tag-color"
              type="color"
              className="h-9 w-16 cursor-pointer rounded-md border border-gray-300 dark:border-gray-600"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={createTagMutation.isPending}>
            {createTagMutation.isPending ? "Création..." : "Ajouter le tag"}
          </Button>
        </form>
      </section>

      {/* ---- Segments panel ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Segments dynamiques</h2>
          <Button onClick={openCreateModal}>Créer un segment</Button>
        </div>

        {segmentsQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>}
        {!segmentsQuery.isLoading && segments.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun segment pour le moment.</p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {segments.map((segment) => (
            <div key={segment.id} className="card flex flex-col justify-between">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{segment.name}</h3>
                  <Badge color={segment.filterMode === "AND" ? "blue" : "purple"}>
                    {segment.filterMode === "AND" ? "ET" : "OU"}
                  </Badge>
                </div>
                {segment.description && (
                  <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">{segment.description}</p>
                )}
                <p className="text-xs text-gray-600 dark:text-gray-300">{summarizeSegment(segment, tagsById)}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEditModal(segment)}>
                  Modifier
                </Button>
                <Button variant="danger" size="sm" onClick={() => setSegmentToDelete(segment)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Create/edit segment modal ---- */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingSegment ? "Modifier le segment" : "Créer un segment"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="segment-name" className="label">
              Nom
            </label>
            <input
              id="segment-name"
              type="text"
              className="input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="segment-description" className="label">
              Description
            </label>
            <textarea
              id="segment-description"
              className="input"
              rows={2}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div>
            <span className="label">Mode de filtrage</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormFilterMode("AND")}
                className={`btn px-3 py-1.5 text-sm ${
                  formFilterMode === "AND"
                    ? "bg-brand-600 text-white dark:bg-brand-500"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                }`}
              >
                ET (toutes les règles)
              </button>
              <button
                type="button"
                onClick={() => setFormFilterMode("OR")}
                className={`btn px-3 py-1.5 text-sm ${
                  formFilterMode === "OR"
                    ? "bg-brand-600 text-white dark:bg-brand-500"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                }`}
              >
                OU (au moins une règle)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <span className="label mb-0">Règles</span>
            {formRules.map((rule, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700"
              >
                <select
                  className="input w-auto"
                  value={rule.field}
                  onChange={(e) => handleFieldChange(index, e.target.value as FilterField)}
                >
                  {FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  className="input w-auto"
                  value={rule.operator}
                  onChange={(e) => updateRule(index, { operator: e.target.value })}
                >
                  {operatorOptionsForField(rule.field).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {rule.field === "tagIds" && (
                  <select
                    multiple
                    className="input w-auto min-w-[140px]"
                    value={Array.isArray(rule.value) ? (rule.value as string[]) : []}
                    onChange={(e) =>
                      updateRule(index, {
                        value: Array.from(e.target.selectedOptions).map((option) => option.value),
                      })
                    }
                  >
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                )}

                {rule.field === "isUnsubscribed" && (
                  <select
                    className="input w-auto"
                    value={rule.value ? "true" : "false"}
                    onChange={(e) => updateRule(index, { value: e.target.value === "true" })}
                  >
                    <option value="true">Oui</option>
                    <option value="false">Non</option>
                  </select>
                )}

                {rule.field === "genre" && rule.operator === "in" && (
                  <select
                    multiple
                    className="input w-auto min-w-[140px]"
                    value={Array.isArray(rule.value) ? (rule.value as string[]) : []}
                    onChange={(e) =>
                      updateRule(index, {
                        value: Array.from(e.target.selectedOptions).map((option) => option.value),
                      })
                    }
                  >
                    {(Object.entries(GENRE_VALUE_LABELS) as [Genre, string][]).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}

                {rule.field === "genre" && rule.operator !== "in" && (
                  <select
                    className="input w-auto"
                    value={typeof rule.value === "string" ? rule.value : ""}
                    onChange={(e) => updateRule(index, { value: e.target.value })}
                  >
                    <option value="">— Choisir —</option>
                    {(Object.entries(GENRE_VALUE_LABELS) as [Genre, string][]).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}

                {rule.field !== "tagIds" && rule.field !== "isUnsubscribed" && rule.field !== "genre" && (
                  <input
                    type="text"
                    className="input w-auto flex-1 min-w-[140px]"
                    placeholder={rule.operator === "in" ? "valeur1, valeur2, ..." : "Valeur"}
                    value={typeof rule.value === "string" ? rule.value : ""}
                    onChange={(e) => updateRule(index, { value: e.target.value })}
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeRule(index)}
                  className="ml-auto text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Supprimer cette règle"
                >
                  &times;
                </button>
              </div>
            ))}

            <Button type="button" variant="secondary" size="sm" onClick={addRule}>
              + Ajouter une règle
            </Button>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Annuler
            </Button>
            <Button type="submit" disabled={segmentMutation.isPending}>
              {segmentMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- Delete tag confirmation ---- */}
      <Modal isOpen={!!tagToDelete} onClose={() => setTagToDelete(null)} title="Supprimer le tag">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le tag « {tagToDelete?.name} » ? Cette action est irréversible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTagToDelete(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeTagMutation.isPending}
            onClick={() => tagToDelete && removeTagMutation.mutate(tagToDelete.id)}
          >
            {removeTagMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>

      {/* ---- Delete segment confirmation ---- */}
      <Modal isOpen={!!segmentToDelete} onClose={() => setSegmentToDelete(null)} title="Supprimer le segment">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Voulez-vous vraiment supprimer le segment « {segmentToDelete?.name} » ? Cette action est irréversible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSegmentToDelete(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={removeSegmentMutation.isPending}
            onClick={() => segmentToDelete && removeSegmentMutation.mutate(segmentToDelete.id)}
          >
            {removeSegmentMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>

      <GroupMembersModal tag={viewingTag} onClose={() => setViewingTag(null)} />
    </div>
  );
}
