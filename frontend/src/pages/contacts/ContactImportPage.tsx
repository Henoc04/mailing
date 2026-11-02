import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import * as contactImportApi from "../../api/contactImport.api";
import * as tagsApi from "../../api/tags.api";
import type {
  ContactImportConfirmResult,
  ContactImportPreviewResult,
} from "../../api/contactImport.api";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
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

const STEP_LABELS: Record<Step, string> = {
  1: "Fichier",
  2: "Colonnes",
  3: "Import",
};

const TH_CLASS =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";

function tagChipClass(selected: boolean): string {
  return clsx(
    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
    selected
      ? "bg-brand-600 text-white ring-brand-600 shadow-sm hover:bg-brand-500 dark:bg-brand-500 dark:ring-brand-500"
      : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
  );
}

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
      <PageHeader
        title="Importer des contacts"
        description="Ajoutez des contacts en masse depuis un fichier CSV ou Excel."
        back={{ to: "/contacts", label: "Retour aux contacts" }}
      />

      <ol className="flex items-center gap-2 text-sm" aria-label="Étapes de l'import">
        {([1, 2, 3] as Step[]).map((s) => {
          const isDone = s < step || (s === 3 && confirmResult !== null);
          const isCurrent = s === step && !isDone;
          return (
            <li key={s} className={clsx("flex items-center gap-2", s < 3 && "flex-1")}>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={clsx(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                  isCurrent && "bg-brand-600 text-white shadow-sm ring-4 ring-brand-500/15 dark:bg-brand-500",
                  isDone && "bg-emerald-600 text-white dark:bg-emerald-500",
                  !isCurrent && !isDone && "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                {isDone ? <Icon name="check" className="h-4 w-4" /> : s}
              </span>
              <span
                className={clsx(
                  "hidden font-medium sm:inline",
                  isCurrent ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
                )}
              >
                {STEP_LABELS[s]}
              </span>
              {s < 3 && (
                <span
                  className={clsx(
                    "h-px min-w-[1.5rem] flex-1",
                    s < step ? "bg-emerald-500/60" : "bg-gray-300 dark:bg-gray-700"
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="card space-y-4">
          <div>
            <h2 className="section-title">1. Choisir un fichier</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Formats acceptés : CSV, TXT, XLSX, XLS.</p>
          </div>

          <label
            htmlFor="import-file"
            className={clsx(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
              selectedFile
                ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/50 dark:bg-brand-500/5"
                : "border-gray-300 hover:border-brand-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-brand-500/50 dark:hover:bg-gray-800/40"
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Icon name={selectedFile ? "checkCircle" : "inbox"} />
            </span>
            {selectedFile ? (
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Fichier sélectionné :{" "}
                <span className="break-all font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</span>
              </span>
            ) : (
              <span className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium text-brand-600 dark:text-brand-400">Choisissez un fichier</span> à importer
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedFile ? "Cliquez pour choisir un autre fichier" : "CSV, TXT, XLSX ou XLS"}
            </span>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          <div className="flex flex-col sm:flex-row sm:justify-end">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleUploadSubmit}
              loading={previewMutation.isPending}
            >
              Analyser le fichier
              {!previewMutation.isPending && <Icon name="chevronRight" className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && previewResult && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div>
              <h2 className="section-title">2. Associer les colonnes</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Indiquez à quel champ contact correspond chaque colonne du fichier.
              </p>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50/80 dark:bg-gray-800/40">
                    <tr>
                      <th scope="col" className={TH_CLASS}>
                        Colonne du fichier
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Champ contact
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {previewResult.headers.map((header) => (
                      <tr key={header}>
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <span className="block max-w-[10rem] break-words sm:max-w-xs">{header}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <select
                            className={clsx(
                              "input min-w-[9rem]",
                              !columnMapping[header] && "text-gray-500 dark:text-gray-400"
                            )}
                            aria-label={`Champ contact pour la colonne ${header}`}
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
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Aperçu des données (5 premières lignes)
              </h3>
              <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                    <thead className="bg-gray-50/80 dark:bg-gray-800/40">
                      <tr>
                        {previewResult.headers.map((header) => (
                          <th key={header} scope="col" className={TH_CLASS}>
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {previewResult.rows.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          {previewResult.headers.map((header) => (
                            <td
                              key={header}
                              className="max-w-[16rem] truncate whitespace-nowrap px-4 py-2.5 text-gray-700 dark:text-gray-300"
                              title={String(row[header] ?? "")}
                            >
                              {String(row[header] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-5">
            <div>
              <h2 className="section-title">Groupes et tags</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Optionnel : classez directement les contacts importés.
              </p>
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
                        aria-pressed={selected}
                        onClick={() => toggleTagName(tag.name)}
                        className={tagChipClass(selected)}
                      >
                        {selected && <Icon name="check" className="-ml-0.5 mr-1 inline h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Aucun tag existant.</p>
                )}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="tags">
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
                className="input sm:max-w-xs"
                value={groupByField}
                onChange={(e) => setGroupByField(e.target.value)}
              >
                {GROUPABLE_FIELD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="hint">
                Un groupe (tag) sera créé automatiquement pour chaque valeur distincte de ce champ (ex : un groupe
                par département). S'ajoute aux tags ci-dessus, sans les remplacer.
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              <Icon name="chevronLeft" className="h-4 w-4" />
              Retour
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={() => setStep(3)}>
              Continuer
              <Icon name="chevronRight" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && !confirmResult && (
        <div className="card space-y-4">
          <div>
            <h2 className="section-title">3. Confirmer l'import</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Vérifiez le mapping des colonnes puis lancez l'import. Cette opération peut prendre quelques instants
              selon la taille du fichier.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => setStep(2)}
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
              Retour
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
            >
              {!confirmMutation.isPending && <Icon name="bolt" className="h-4 w-4" />}
              Lancer l'import
            </Button>
          </div>
        </div>
      )}

      {step === 3 && confirmResult && (
        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Icon name="checkCircle" />
            </span>
            <h2 className="section-title">Résultat de l'import</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:ring-emerald-400/20">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Contacts créés</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                {confirmResult.created.toLocaleString("fr-FR")}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:ring-amber-400/20">
              <p className="text-sm text-amber-700 dark:text-amber-300">Lignes ignorées</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                {confirmResult.skipped.toLocaleString("fr-FR")}
              </p>
            </div>
          </div>

          {confirmResult.errors.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Erreurs ({confirmResult.errors.length})
              </h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {confirmResult.errors.map((error, idx) => (
                  <li key={idx}>
                    Ligne {error.row} : {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 sm:flex-row sm:justify-between">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={resetWizard}>
              Importer un autre fichier
            </Button>
            <Link
              to="/contacts"
              className="btn h-10 w-full bg-brand-600 px-4 text-sm text-white shadow-sm hover:bg-brand-500 sm:w-auto"
            >
              Voir les contacts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
