import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import clsx from "clsx";
import * as companySearchApi from "../../api/companySearch.api";
import type { CompanySearchResult, GuessEmailResult } from "../../api/companySearch.api";
import * as contactsApi from "../../api/contacts.api";
import * as tagsApi from "../../api/tags.api";
import type { ApiErrorBody } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
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

function tagChipClass(selected: boolean): string {
  return clsx(
    "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition",
    selected
      ? "bg-brand-600 text-white ring-brand-600 shadow-sm hover:bg-brand-500 dark:bg-brand-500 dark:ring-brand-500"
      : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
  );
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchMutation.isPending) return;
    handleSearch();
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
      className: "w-10",
      header: (
        <input
          type="checkbox"
          aria-label="Tout sélectionner"
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
          aria-label={`Sélectionner ${row.name}`}
          checked={row.checked}
          onChange={(e) => updateRow(row.placeId, { checked: e.target.checked })}
        />
      ),
    },
    {
      key: "name",
      header: "Nom",
      render: (row) => (
        <span className="block min-w-[8rem] max-w-[14rem] break-words font-medium text-gray-900 dark:text-gray-100">
          {row.name}
        </span>
      ),
    },
    {
      key: "address",
      header: "Adresse",
      hideBelow: "lg",
      render: (row) => <span className="block min-w-[10rem] max-w-[16rem] break-words">{row.address ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "Téléphone",
      hideBelow: "md",
      className: "whitespace-nowrap",
      render: (row) => row.phone ?? "—",
    },
    {
      key: "website",
      header: "Site web",
      hideBelow: "md",
      render: (row) =>
        row.website ? (
          <a
            href={row.website}
            target="_blank"
            rel="noreferrer"
            title={row.website}
            className="link block max-w-[12rem] truncate"
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
      hideBelow: "lg",
      render: (row) => row.sectorsMatched.join(", "),
    },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <div className="min-w-[15rem] space-y-1.5 sm:min-w-[18rem]">
          <div className="flex items-center gap-2">
            <input
              type="email"
              inputMode="email"
              className="input"
              aria-label={`Email pour ${row.name}`}
              placeholder="email@entreprise.com"
              value={row.email}
              onChange={(e) => updateRow(row.placeId, { email: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              loading={row.isGuessing}
              disabled={!row.website || isGuessingAll}
              title={row.website ? "Deviner l'email à partir du site web" : "Site web manquant"}
              onClick={() => handleGuessEmail(row)}
            >
              Deviner
            </Button>
          </div>
          {row.foundEmails.length > 1 && (
            <select
              className="input"
              aria-label={`Emails trouvés pour ${row.name}`}
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
      <PageHeader
        title="Recherche d'entreprises"
        description="Recherchez des entreprises par pays, ville et secteur d'activité, avec suggestion d'email."
      />

      <form onSubmit={handleSearchSubmit} className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="country">
              Pays
            </label>
            <input
              id="country"
              className="input"
              placeholder="Côte d'Ivoire"
              autoComplete="country-name"
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
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label" htmlFor="sectors">
              Secteurs
            </label>
            <input
              id="sectors"
              className="input"
              placeholder="Formation, IT, BTP"
              value={sectorsInput}
              onChange={(e) => setSectorsInput(e.target.value)}
            />
            <p className="hint">Séparés par des virgules.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end">
          <Button type="submit" className="w-full sm:w-auto" loading={searchMutation.isPending}>
            {!searchMutation.isPending && <Icon name="search" className="h-4 w-4" />}
            Rechercher
          </Button>
        </div>
      </form>

      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300" aria-live="polite">
                {guessAllProgress
                  ? `Recherche des emails… ${guessAllProgress.done}/${guessAllProgress.total}`
                  : `${rows.length} résultat(s)`}
              </p>
              {guessAllProgress && (
                <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all"
                    style={{
                      width: `${
                        guessAllProgress.total > 0 ? (guessAllProgress.done / guessAllProgress.total) * 100 : 0
                      }%`,
                    }}
                  />
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={handleGuessAllEmails}
              loading={isGuessingAll}
            >
              {!isGuessingAll && <Icon name="mail" className="h-4 w-4" />}
              Trouver tous les emails
            </Button>
          </div>

          <Table columns={columns} rows={rows} rowKey={(row) => row.placeId} />

          <div className="card space-y-4">
            <div>
              <h2 className="section-title">Tags à appliquer aux contacts importés</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Optionnel : ils seront ajoutés à chaque contact créé.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {existingTags?.length ? (
                existingTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
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

          <div className="flex flex-col gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-soft dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{selectedCount}</span>{" "}
              sélectionné(s)
            </p>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleImportSelection}
              disabled={selectedCount === 0}
              loading={isImporting}
            >
              {!isImporting && <Icon name="plus" className="h-4 w-4" />}
              Importer la sélection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
