import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import * as campaignsApi from "../../api/campaigns.api";
import type { Campaign, CampaignStatus } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { CLICK_TRACKING_ENABLED } from "../../config/features";

type SortKey = "name" | "status" | "sentCount" | "failedCount" | "openedCount" | "clickedCount" | "startedAt" | "completedAt";
type SortDirection = "asc" | "desc";

const STATUS_COLORS: Record<CampaignStatus, BadgeColor> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  SENDING: "yellow",
  PAUSED: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  FAILED: "red",
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Planifiée",
  SENDING: "Envoi en cours",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  FAILED: "Échouée",
};

// Secondary columns collapse on small screens; their values are repeated
// under the campaign name instead (see the first cell).
const COUNT_COL = "hidden md:table-cell";
const DATE_COL = "hidden lg:table-cell";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function compareValues(a: Campaign, b: Campaign, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "status":
      return a.status.localeCompare(b.status);
    case "sentCount":
      return a.sentCount - b.sentCount;
    case "failedCount":
      return a.failedCount - b.failedCount;
    case "openedCount":
      return a.openedCount - b.openedCount;
    case "clickedCount":
      return a.clickedCount - b.clickedCount;
    case "startedAt":
      return (a.startedAt ? new Date(a.startedAt).getTime() : 0) - (b.startedAt ? new Date(b.startedAt).getTime() : 0);
    case "completedAt":
      return (
        (a.completedAt ? new Date(a.completedAt).getTime() : 0) -
        (b.completedAt ? new Date(b.completedAt).getTime() : 0)
      );
    default:
      return 0;
  }
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortHeader({ label, sortKey, currentKey, direction, onSort, className }: SortHeaderProps) {
  const isActive = currentKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={clsx("whitespace-nowrap px-4 py-3 text-left", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={clsx(
          "group inline-flex items-center gap-1 rounded text-left text-xs font-semibold uppercase tracking-wider transition-colors",
          isActive
            ? "text-gray-900 dark:text-gray-100"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        )}
      >
        {label}
        <Icon
          name="chevronDown"
          className={clsx(
            "h-3.5 w-3.5 transition",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            isActive && direction === "asc" && "rotate-180"
          )}
        />
      </button>
    </th>
  );
}

export default function SendJournalPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: campaigns, isLoading, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
    // This list has no per-row Socket.IO subscription (unlike the single-campaign
    // progress page), so polling is what keeps sent/failed/opened/clicked counts
    // current without a manual reload.
    refetchInterval: 5000,
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  const filteredAndSorted = useMemo(() => {
    const list = campaigns ?? [];
    const filtered = search.trim()
      ? list.filter((campaign) => campaign.name.toLowerCase().includes(search.trim().toLowerCase()))
      : list;

    const sorted = [...filtered].sort((a, b) => compareValues(a, b, sortKey));
    if (sortDirection === "desc") sorted.reverse();
    return sorted;
  }, [campaigns, search, sortKey, sortDirection]);

  const sortProps = { currentKey: sortKey, direction: sortDirection, onSort: handleSort };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d'envoi"
        description={
          <span className="block max-w-3xl">
            Suivi agrégé par campagne. Pour le détail par destinataire, consultez « Voir le détail » sur une
            campagne.
          </span>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative w-full sm:max-w-sm">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            className="input pl-9"
            placeholder="Rechercher une campagne…"
            aria-label="Rechercher une campagne"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>Impossible de charger le journal d'envoi.</ErrorState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50/80 dark:bg-gray-800/40">
                <tr>
                  <SortHeader label="Nom de la campagne" sortKey="name" {...sortProps} />
                  <SortHeader label="Statut" sortKey="status" {...sortProps} />
                  <SortHeader label="Envoyés" sortKey="sentCount" className={COUNT_COL} {...sortProps} />
                  <SortHeader label="Échecs" sortKey="failedCount" className={COUNT_COL} {...sortProps} />
                  <SortHeader label="Ouvertures" sortKey="openedCount" className={COUNT_COL} {...sortProps} />
                  {CLICK_TRACKING_ENABLED && (
                    <SortHeader label="Clics" sortKey="clickedCount" className={COUNT_COL} {...sortProps} />
                  )}
                  <SortHeader label="Démarré le" sortKey="startedAt" className={DATE_COL} {...sortProps} />
                  <SortHeader label="Terminé le" sortKey="completedAt" className={DATE_COL} {...sortProps} />
                  <th
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    <span className="sr-only sm:not-sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={CLICK_TRACKING_ENABLED ? 9 : 8}>
                      <EmptyState
                        icon="search"
                        title="Aucune campagne ne correspond à votre recherche."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((campaign) => (
                    <tr key={campaign.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3.5 text-sm">
                        <p className="min-w-[8rem] break-words font-medium text-gray-900 dark:text-gray-100">
                          {campaign.name}
                        </p>
                        {/* Compact recap of the columns hidden on small screens. */}
                        <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400 md:hidden">
                          {campaign.sentCount} envoyés · {campaign.failedCount} échecs · {campaign.openedCount} ouvertures
                          {CLICK_TRACKING_ENABLED && ` · ${campaign.clickedCount} clics`}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 lg:hidden">
                          {formatDateTime(campaign.startedAt)} → {formatDateTime(campaign.completedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <Badge dot color={STATUS_COLORS[campaign.status]}>
                          {STATUS_LABELS[campaign.status]}
                        </Badge>
                      </td>
                      <td className={clsx(COUNT_COL, "px-4 py-3.5 text-sm tabular-nums text-gray-700 dark:text-gray-300")}>
                        {campaign.sentCount}
                      </td>
                      <td className={clsx(COUNT_COL, "px-4 py-3.5 text-sm tabular-nums text-gray-700 dark:text-gray-300")}>
                        {campaign.failedCount}
                      </td>
                      <td className={clsx(COUNT_COL, "px-4 py-3.5 text-sm tabular-nums text-gray-700 dark:text-gray-300")}>
                        {campaign.openedCount}
                      </td>
                      {CLICK_TRACKING_ENABLED && (
                        <td
                          className={clsx(COUNT_COL, "px-4 py-3.5 text-sm tabular-nums text-gray-700 dark:text-gray-300")}
                        >
                          {campaign.clickedCount}
                        </td>
                      )}
                      <td className={clsx(DATE_COL, "whitespace-nowrap px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300")}>
                        {formatDateTime(campaign.startedAt)}
                      </td>
                      <td className={clsx(DATE_COL, "whitespace-nowrap px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300")}>
                        {formatDateTime(campaign.completedAt)}
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <Link
                          to={`/campaigns/${campaign.id}/progress`}
                          className="link inline-flex items-center gap-1 whitespace-nowrap"
                          aria-label={`Voir le détail de « ${campaign.name} »`}
                        >
                          <span className="hidden sm:inline">Voir le détail</span>
                          <Icon name="chevronRight" className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
