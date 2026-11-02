import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as contactImportApi from "../../api/contactImport.api";
import * as tagsApi from "../../api/tags.api";
import type {
  ContactImportConfirmResult,
  ContactImportPreviewResult,
} from "../../api/contactImport.api";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/ToastProvider";
import { isAxiosError } from "axios";
import type { ApiErrorBody } from "../../api/types";

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

const CONTACT_FIELDS: Array<{ value: string; label: string }> = [
  { value: "", label: "Ignorer ce champ" },
  { value: "prenom", label: "Prénom" },
  { value: "nom", label: "Nom" },
  { value: "genre", label: "Genre" },
  { value: "email", label: "Email" },
  { value: "entreprise", label: "Entreprise" },
  { value: "fonction", label: "Fonction" },
  { value: "telephone", label: "Téléphone" },
  { value: "adresse", label: "Adresse" },
  { value: "codePostal", label: "Code postal" },
  { value: "ville", label: "Ville" },
  { value: "departement", label: "Département" },
  { value: "region", label: "Région" },
  { value: "pays", label: "Pays" },
  { value: "siteWeb", label: "Site internet" },
  { value: "notes", label: "Notes" },
];

// Mirrors backend/src/services/contactImport.service.ts's GROUPABLE_FIELDS —
// fields worth auto-creating one group (tag) per distinct value seen in the
// file. Free-text fields (adresse, notes, telephone...) are excluded since
// their values are essentially unique per row.
const GROUPABLE_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Aucun" },
  { value: "departement", label: "Département" },
  { value: "region", label: "Région" },
  { value: "ville", label: "Ville" },
  { value: "pays", label: "Pays" },
  { value: "entreprise", label: "Entreprise" },
  { value: "genre", label: "Genre" },
];

type Step = 1 | 2 | 3;

// The backend's `suggestedMapping` (and the `columnMapping` sent to
// `confirm()`) is keyed by CONTACT FIELD → file header, e.g.
// `{ nom: "Nom", email: "Adresse e-mail" }`. The UI below is structured the
// other way around — one row per FILE HEADER, letting the user pick which
// contact field it maps to — so local component state is kept as
// header → field, and converted at both boundaries.
function invertMapping(mapping: Record<string, string | null>): Record<string, string> {
  const inverted: Record<string, string> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (header) inverted[header] = field;
  }
  return inverted;
}

export default function ContactImportPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ContactImportPreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [groupByField, setGroupByField] = useState("");
  const [confirmResult, setConfirmResult] = useState<ContactImportConfirmResult | null>(null);

  const { data: existingTags } = useQuery({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  function toggleTagName(name: string) {
    setSelectedTagNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  const previewMutation = useMutation({
    mutationFn: (file: File) => contactImportApi.preview(file),
    onSuccess: (result) => {
      setPreviewResult(result);
      setColumnMapping(invertMapping(result.suggestedMapping));
      setStep(2);
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible d'analyser le fichier importé"), "error"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!previewResult) throw new Error("Aucun aperçu disponible");
      const newTagNames = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const tagNames = Array.from(new Set([...selectedTagNames, ...newTagNames]));
      // Convert the UI's header → field state back to the field → header
      // shape the backend's `importRows`/`getMappedValue` expect.
      const fieldToHeader: Record<string, string> = {};
      for (const [header, field] of Object.entries(columnMapping)) {
        if (field) fieldToHeader[field] = header;
      }
      return contactImportApi.confirm(previewResult.filePath, fieldToHeader, tagNames, groupByField || undefined);
    },
    onSuccess: (result) => {
      setConfirmResult(result);
      setStep(3);
      showToast("Import terminé", "success");
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible de finaliser l'import"), "error"),
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  function handleUploadSubmit() {
    if (!selectedFile) {
      showToast("Veuillez sélectionner un fichier", "error");
      return;
    }
    previewMutation.mutate(selectedFile);
  }

  function handleMappingChange(header: string, value: string) {
    setColumnMapping((prev) => ({ ...prev, [header]: value }));
  }

  function resetWizard() {
    setStep(1);
    setSelectedFile(null);
    setPreviewResult(null);
    setColumnMapping({});
    setSelectedTagNames([]);
    setTagsInput("");
    setGroupByField("");
    setConfirmResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Importer des contacts</h1>
        <Link to="/contacts" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          ← Retour aux contacts
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={
                s === step
                  ? "flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 font-semibold text-white"
                  : s < step
                  ? "flex h-7 w-7 items-center justify-center rounded-full bg-green-600 font-semibold text-white"
                  : "flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              }
            >
              {s}
            </span>
            {s < 3 && <span className="h-px w-8 bg-gray-300 dark:bg-gray-600" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">1. Choisir un fichier</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Formats acceptés : CSV, TXT, XLSX, XLS.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-700 dark:text-gray-300"
          />
          {selectedFile && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Fichier sélectionné : <span className="font-medium">{selectedFile.name}</span>
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={handleUploadSubmit} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Analyse en cours..." : "Analyser le fichier"}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && previewResult && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            2. Associer les colonnes
          </h2>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Colonne du fichier
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Champ contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {previewResult.headers.map((header) => (
                  <tr key={header}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{header}</td>
                    <td className="px-3 py-2 text-sm">
                      <select
                        className="input"
                        value={columnMapping[header] ?? ""}
                        onChange={(e) => handleMappingChange(header, e.target.value)}
                      >
                        {CONTACT_FIELDS.map((field) => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Aperçu des données (5 premières lignes)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {previewResult.headers.map((header) => (
                      <th
                        key={header}
                        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {previewResult.rows.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      {previewResult.headers.map((header) => (
                        <td key={header} className="px-3 py-2 text-gray-700 dark:text-gray-200">
                          {String(row[header] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <span className="label">Tags à appliquer à tous les contacts importés</span>
            <div className="flex flex-wrap gap-2">
              {existingTags?.length ? (
                existingTags.map((tag) => {
                  const selected = selectedTagNames.includes(tag.name);
                  return (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => toggleTagName(tag.name)}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Aucun tag existant.</p>
              )}
            </div>
            <label className="label mt-3" htmlFor="tags">
              Nouveaux tags à créer (séparés par des virgules)
            </label>
            <input
              id="tags"
              className="input"
              placeholder="Prospects, Clients"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="groupByField">
              Créer un groupe automatique par
            </label>
            <select
              id="groupByField"
              className="input"
              value={groupByField}
              onChange={(e) => setGroupByField(e.target.value)}
            >
              {GROUPABLE_FIELD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Un groupe (tag) sera créé automatiquement pour chaque valeur distincte de ce champ (ex : un groupe
              par département). S'ajoute aux tags ci-dessus, sans les remplacer.
            </p>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Retour
            </Button>
            <Button onClick={() => setStep(3)}>Continuer</Button>
          </div>
        </div>
      )}

      {step === 3 && !confirmResult && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">3. Confirmer l'import</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Vérifiez le mapping des colonnes puis lancez l'import. Cette opération peut prendre quelques
            instants selon la taille du fichier.
          </p>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Retour
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? "Import en cours..." : "Lancer l'import"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && confirmResult && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Résultat de l'import</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/30">
              <p className="text-sm text-green-700 dark:text-green-300">Contacts créés</p>
              <p className="text-2xl font-semibold text-green-800 dark:text-green-200">
                {confirmResult.created}
              </p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/30">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">Lignes ignorées</p>
              <p className="text-2xl font-semibold text-yellow-800 dark:text-yellow-200">
                {confirmResult.skipped}
              </p>
            </div>
          </div>

          {confirmResult.errors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Erreurs ({confirmResult.errors.length})
              </h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                {confirmResult.errors.map((error, idx) => (
                  <li key={idx}>
                    Ligne {error.row} : {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={resetWizard}>
              Importer un autre fichier
            </Button>
            <Link to="/contacts">
              <Button>Voir les contacts</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
