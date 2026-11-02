import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as contactsApi from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { Genre } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";

const GENRE_LABELS: Record<Genre, string> = {
  HOMME: "Monsieur",
  FEMME: "Madame",
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

  if (isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Chargement...</p>;
  }

  if (isError || !contact) {
    return (
      <div className="space-y-4">
        <p className="text-red-600 dark:text-red-400">Contact introuvable.</p>
        <Link to="/contacts" className="text-brand-600 hover:underline dark:text-brand-400">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/contacts" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          ← Retour
        </Link>
        <div className="flex gap-2">
          {!isEditing && <Button onClick={startEditing}>Modifier</Button>}
          <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
            Supprimer
          </Button>
        </div>
      </div>

      {!isEditing || !form ? (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom}
            </h1>
            <Badge color={contact.isUnsubscribed ? "red" : "green"}>
              {contact.isUnsubscribed ? "Désinscrit" : "Actif"}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Genre</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {contact.genre ? GENRE_LABELS[contact.genre] : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Téléphone</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.telephone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Entreprise</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.entreprise ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Fonction</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.fonction ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Site internet</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.siteWeb ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Adresse</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.adresse ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Code postal</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.codePostal ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Ville</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.ville ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Département</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.departement ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Région</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.region ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Pays</dt>
              <dd className="text-gray-900 dark:text-gray-100">{contact.pays ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
              <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{contact.notes ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="mb-1 text-gray-500 dark:text-gray-400">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {contact.tags.length === 0 ? (
                  <span className="text-gray-900 dark:text-gray-100">—</span>
                ) : (
                  contact.tags.map((tag) => (
                    <Badge key={tag.id} color="purple">
                      {tag.name}
                    </Badge>
                  ))
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Créé le</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {new Date(contact.createdAt).toLocaleString("fr-FR")}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Mis à jour le</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {new Date(contact.updatedAt).toLocaleString("fr-FR")}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
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
            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      )}

      <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Supprimer le contact">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Voulez-vous vraiment supprimer « {contact.prenom ? `${contact.prenom} ${contact.nom}` : contact.nom} » ?
          Cette action est irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
            Annuler
          </Button>
          <Button variant="danger" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
            {removeMutation.isPending ? "Suppression..." : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
