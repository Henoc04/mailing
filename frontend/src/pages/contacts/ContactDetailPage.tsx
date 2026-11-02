import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import * as contactsApi from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { Genre } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useToast } from "../../components/ui/ToastProvider";

const GENRE_LABELS: Record<Genre, string> = {
  HOMME: "Monsieur",
  FEMME: "Madame",
  AUTRE: "Autre",
};

const ERROR_CLASS = "mt-1.5 text-xs text-red-600 dark:text-red-400";

function tagChipClass(selected: boolean): string {
  return clsx(
    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
    selected
      ? "bg-brand-600 text-white ring-brand-600 shadow-sm hover:bg-brand-500 dark:bg-brand-500 dark:ring-brand-500"
      : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
  );
}

/** One label/value pair of the read-only contact sheet. */
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={clsx("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

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

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: contact, isLoading, isError } = useQuery({
    queryKey: ["contacts", id],
    queryFn: () => contactsApi.getOne(id as string),
    enabled: Boolean(id),
  });

  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id || !form) return;
      await contactsApi.update(id, {
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
      });
      await contactsApi.setTags(id, form.tagIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact mis à jour", "success");
      setIsEditing(false);
    },
    onError: () => showToast("Impossible de mettre à jour le contact", "error"),
  });

  const removeMutation = useMutation({
    mutationFn: () => contactsApi.remove(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      showToast("Contact supprimé", "success");
      navigate("/contacts");
    },
    onError: () => showToast("Impossible de supprimer le contact", "error"),
  });

  function startEditing() {
    if (!contact) return;
    setForm({
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
    });
    setFormErrors({});
    setIsEditing(true);
  }

  function toggleTagId(tagId: string) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            tagIds: prev.tagIds.includes(tagId)
              ? prev.tagIds.filter((t) => t !== tagId)
              : [...prev.tagIds, tagId],
          }
        : prev
    );
  }

  function validate(): boolean {
    if (!form) return false;
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
    updateMutation.mutate();
  }

  const back = { to: "/contacts", label: "Retour aux contacts" };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contact" back={back} />
        <LoadingState label="Chargement du contact…" />
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contact" back={back} />
        <ErrorState
          action={
            <Link to="/contacts" className="shrink-0 font-medium underline underline-offset-2">
              Retour à la liste
            </Link>
          }
        >
          Contact introuvable.
        </ErrorState>
      </div>
    );
  }

  const fullName = contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="break-words">{fullName}</span>
            <Badge dot color={contact.isUnsubscribed ? "red" : "green"}>
              {contact.isUnsubscribed ? "Désinscrit" : "Actif"}
            </Badge>
          </span>
        }
        description={<span className="break-all">{contact.email}</span>}
        actions={
          <>
            {!isEditing && (
              <Button type="button" onClick={startEditing}>
                Modifier
              </Button>
            )}
            <Button type="button" variant="danger" onClick={() => setIsDeleteOpen(true)}>
              <Icon name="trash" className="h-4 w-4" />
              Supprimer
            </Button>
          </>
        }
      />

      {!isEditing || !form ? (
        <>
          <section className="card">
            <h2 className="section-title">Coordonnées</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Genre">{contact.genre ? GENRE_LABELS[contact.genre] : "—"}</Field>
              <Field label="Email">
                <a href={`mailto:${contact.email}`} className="link break-all">
                  {contact.email}
                </a>
              </Field>
              <Field label="Téléphone">{contact.telephone ?? "—"}</Field>
              <Field label="Entreprise">{contact.entreprise ?? "—"}</Field>
              <Field label="Fonction">{contact.fonction ?? "—"}</Field>
              <Field label="Site internet">
                <span className="break-all">{contact.siteWeb ?? "—"}</span>
              </Field>
            </dl>
          </section>

          <section className="card">
            <h2 className="section-title">Adresse</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Adresse" wide>
                {contact.adresse ?? "—"}
              </Field>
              <Field label="Code postal">{contact.codePostal ?? "—"}</Field>
              <Field label="Ville">{contact.ville ?? "—"}</Field>
              <Field label="Département">{contact.departement ?? "—"}</Field>
              <Field label="Région">{contact.region ?? "—"}</Field>
              <Field label="Pays">{contact.pays ?? "—"}</Field>
            </dl>
          </section>

          <section className="card">
            <h2 className="section-title">Suivi</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Tags" wide>
                <span className="flex flex-wrap gap-1">
                  {contact.tags.length === 0
                    ? "—"
                    : contact.tags.map((tag) => (
                        <Badge key={tag.id} color="purple">
                          {tag.name}
                        </Badge>
                      ))}
                </span>
              </Field>
              <Field label="Notes" wide>
                <span className="whitespace-pre-wrap">{contact.notes ?? "—"}</span>
              </Field>
              <Field label="Créé le">
                <span className="tabular-nums">{new Date(contact.createdAt).toLocaleString("fr-FR")}</span>
              </Field>
              <Field label="Mis à jour le">
                <span className="tabular-nums">{new Date(contact.updatedAt).toLocaleString("fr-FR")}</span>
              </Field>
            </dl>
          </section>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="card space-y-4">
            <h2 className="section-title">Identité</h2>
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
          </section>

          <section className="card space-y-4">
            <h2 className="section-title">Coordonnées professionnelles</h2>
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
          </section>

          <section className="card space-y-4">
            <h2 className="section-title">Adresse</h2>
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
          </section>

          <section className="card space-y-4">
            <h2 className="section-title">Suivi</h2>
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
          </section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setIsEditing(false)}>
              Annuler
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={updateMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      )}

      <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} size="sm" title="Supprimer le contact">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer «{" "}
          <span className="break-words font-medium text-gray-900 dark:text-gray-100">{fullName}</span> » ? Cette
          action est irréversible.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setIsDeleteOpen(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            loading={removeMutation.isPending}
            onClick={() => removeMutation.mutate()}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
