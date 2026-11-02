import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import * as companySearchApi from "../../api/companySearch.api";
import type { CompanySearchResult, GuessEmailResult } from "../../api/companySearch.api";
import * as contactsApi from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { ApiErrorBody } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Table, type TableColumn } from "../../components/ui/Table";
import { useToast } from "../../components/ui/ToastProvider";

interface ResultRow extends CompanySearchResult {
  checked: boolean;
  email: string;
  foundEmails: GuessEmailResult[];
  isGuessing: boolean;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return fallback;
}

export default function CompanySearchPage() {
  const { showToast } = useToast();

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [sectorsInput, setSectorsInput] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isGuessingAll, setIsGuessingAll] = useState(false);
  const [guessAllProgress, setGuessAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagNamesInput, setNewTagNamesInput] = useState("");

  const { data: existingTags } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.list });

  function toggleTagId(tagId: string) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  const searchMutation = useMutation({
    mutationFn: () => {
      const sectors = sectorsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return companySearchApi.search({ country: country.trim(), city: city.trim(), sectors });
    },
    onSuccess: (results) => {
      setRows(results.map((r) => ({ ...r, checked: false, email: "", foundEmails: [], isGuessing: false })));
      if (results.length === 0) {
        showToast("Aucune entreprise trouvée pour ces critères", "info");
      }
    },
    onError: (error) => showToast(extractErrorMessage(error, "Impossible d'effectuer la recherche"), "error"),
  });

  function handleSearch() {
    if (!country.trim() || !city.trim() || !sectorsInput.trim()) {
      showToast("Pays, ville et au moins un secteur sont requis", "error");
      return;
    }
    searchMutation.mutate();
  }

  function updateRow(placeId: string, patch: Partial<ResultRow>) {
    setRows((prev) => prev.map((row) => (row.placeId === placeId ? { ...row, ...patch } : row)));
  }

  function toggleAllChecked(checked: boolean) {
    setRows((prev) => prev.map((row) => ({ ...row, checked })));
  }

  // Returns true if at least one email was found, so the batch runner can
  // report how many rows actually got something.
  async function guessEmailForRow(row: ResultRow): Promise<boolean> {
    if (!row.website) return false;
    updateRow(row.placeId, { isGuessing: true });
    try {
      const results = await companySearchApi.guessEmail(row.website);
      updateRow(row.placeId, {
        foundEmails: results,
        email: results[0]?.email ?? "",
        isGuessing: false,
      });
      return results.length > 0;
    } catch (error) {
      updateRow(row.placeId, { isGuessing: false });
      showToast(extractErrorMessage(error, `Impossible de deviner l'email pour ${row.name}`), "error");
      return false;
    }
  }

  async function handleGuessEmail(row: ResultRow) {
    const found = await guessEmailForRow(row);
    if (!found) {
      showToast(`Aucun email trouvé pour ${row.name}`, "info");
    }
  }

  // Sequential on purpose — Hunter.io's API has a per-account rate limit,
  // and this can run against every row with a website in one go.
  async function handleGuessAllEmails() {
    const candidates = rows.filter((r) => r.website && !r.email.trim());
    if (candidates.length === 0) {
      showToast("Aucune ligne à traiter (site web manquant ou email déjà renseigné)", "info");
      return;
    }

    setIsGuessingAll(true);
    setGuessAllProgress({ done: 0, total: candidates.length });
    let foundCount = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const found = await guessEmailForRow(candidates[i]);
      if (found) foundCount += 1;
      setGuessAllProgress({ done: i + 1, total: candidates.length });
    }

    setIsGuessingAll(false);
    setGuessAllProgress(null);
    showToast(`${foundCount}/${candidates.length} email(s) trouvé(s)`, foundCount > 0 ? "success" : "info");
  }

  /** Resolves the tag picker's state into concrete tag IDs, creating any genuinely new tag names. */
  async function resolveTagIds(): Promise<string[]> {
    const newNames = newTagNamesInput
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const createdIds: string[] = [];
    for (const name of newNames) {
      const existing = existingTags?.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        createdIds.push(existing.id);
        continue;
      }
      try {
        const created = await tagsApi.create({ name });
        createdIds.push(created.id);
      } catch (error) {
        showToast(extractErrorMessage(error, `Impossible de créer le tag "${name}"`), "error");
      }
    }

    return Array.from(new Set([...selectedTagIds, ...createdIds]));
  }

  async function handleImportSelection() {
    const selected = rows.filter((r) => r.checked);
    const importable = selected.filter((r) => r.email.trim());
    const skipped = selected.length - importable.length;

    if (importable.length === 0) {
      showToast("Aucune ligne sélectionnée n'a d'email renseigné", "error");
      return;
    }

    setIsImporting(true);
    const tagIds = await resolveTagIds();

    let created = 0;
    for (const row of importable) {
      try {
        await contactsApi.create({
          nom: row.name,
          entreprise: row.name,
          email: row.email.trim(),
          telephone: row.phone,
          siteWeb: row.website,
          adresse: row.address,
          ville: city.trim(),
          pays: country.trim(),
          notes: `Importé via la recherche d'entreprises (secteurs : ${row.sectorsMatched.join(", ")})`,
          tagIds,
        });
        created += 1;
      } catch (error) {
        showToast(extractErrorMessage(error, `Échec de l'import pour ${row.name}`), "error");
      }
    }
    setIsImporting(false);

    showToast(
      `${created} contact(s) importé(s)${skipped > 0 ? `, ${skipped} ignoré(s) (email manquant)` : ""}`,
      created > 0 ? "success" : "error"
    );
  }

  const columns: TableColumn<ResultRow>[] = [
    {
      key: "checked",
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
          checked={rows.length > 0 && rows.every((r) => r.checked)}
          ref={(el) => {
            if (el) el.indeterminate = rows.some((r) => r.checked) && !rows.every((r) => r.checked);
          }}
          onChange={(e) => toggleAllChecked(e.target.checked)}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
          checked={row.checked}
          onChange={(e) => updateRow(row.placeId, { checked: e.target.checked })}
        />
      ),
    },
    {
      key: "name",
      header: "Nom",
      render: (row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span>,
    },
    { key: "address", header: "Adresse", render: (row) => row.address ?? "—" },
    { key: "phone", header: "Téléphone", render: (row) => row.phone ?? "—" },
    {
      key: "website",
      header: "Site web",
      render: (row) =>
        row.website ? (
          <a
            href={row.website}
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 hover:underline dark:text-brand-400"
          >
            {row.website}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "sectorsMatched",
      header: "Secteurs",
      render: (row) => row.sectorsMatched.join(", "),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="email"
              className="input"
              placeholder="email@entreprise.com"
              value={row.email}
              onChange={(e) => updateRow(row.placeId, { email: e.target.value })}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!row.website || row.isGuessing || isGuessingAll}
              onClick={() => handleGuessEmail(row)}
            >
              {row.isGuessing ? "..." : "Deviner"}
            </Button>
          </div>
          {row.foundEmails.length > 1 && (
            <select
              className="input"
              value={row.email}
              onChange={(e) => updateRow(row.placeId, { email: e.target.value })}
            >
              {row.foundEmails.map((e) => (
                <option key={e.email} value={e.email}>
                  {e.email}
                  {e.firstName || e.lastName ? ` (${[e.firstName, e.lastName].filter(Boolean).join(" ")})` : ""} —{" "}
                  {e.confidence}%
                </option>
              ))}
            </select>
          )}
        </div>
      ),
    },
  ];

  const selectedCount = rows.filter((r) => r.checked).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Recherche d'entreprises</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Recherchez des entreprises par pays, ville et secteur d'activité, avec suggestion d'email.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="country">
              Pays
            </label>
            <input
              id="country"
              className="input"
              placeholder="Côte d'Ivoire"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="city">
              Ville
            </label>
            <input
              id="city"
              className="input"
              placeholder="Abidjan"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sectors">
              Secteurs (séparés par des virgules)
            </label>
            <input
              id="sectors"
              className="input"
              placeholder="Formation, IT, BTP"
              value={sectorsInput}
              onChange={(e) => setSectorsInput(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSearch} disabled={searchMutation.isPending}>
            {searchMutation.isPending ? "Recherche en cours..." : "Rechercher"}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {guessAllProgress
                ? `Recherche des emails... ${guessAllProgress.done}/${guessAllProgress.total}`
                : `${rows.length} résultat(s)`}
            </p>
            <Button variant="secondary" onClick={handleGuessAllEmails} disabled={isGuessingAll}>
              {isGuessingAll ? "Recherche en cours..." : "Trouver tous les emails"}
            </Button>
          </div>

          <Table columns={columns} rows={rows} rowKey={(row) => row.placeId} />

          <div className="card space-y-3">
            <span className="label mb-0">Tags à appliquer aux contacts importés</span>
            <div className="flex flex-wrap gap-2">
              {existingTags?.length ? (
                existingTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Aucun tag existant.</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="new-tags">
                Nouveaux tags à créer (séparés par des virgules)
              </label>
              <input
                id="new-tags"
                className="input"
                placeholder="Prospects, Abidjan"
                value={newTagNamesInput}
                onChange={(e) => setNewTagNamesInput(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCount} sélectionné(s)</p>
            <Button onClick={handleImportSelection} disabled={selectedCount === 0 || isImporting}>
              {isImporting ? "Import en cours..." : "Importer la sélection"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
