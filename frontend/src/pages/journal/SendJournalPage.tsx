import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as campaignsApi from "../../api/campaigns.api";
import type { Campaign, CampaignStatus } from "../../api/types";
import { Badge, type BadgeColor } from "../../components/ui/Badge";

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
}

function SortHeader({ label, sortKey, currentKey, direction, onSort }: SortHeaderProps) {
  const isActive = currentKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      {label}
      <span className="inline-block w-3 text-[10px]">{isActive ? (direction === "asc" ? "▲" : "▼") : ""}</span>
    </button>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Journal d'envoi</h1>
        <p className="mt-2 max-w-3xl text-xs text-gray-500 dark:text-gray-400">
          Suivi agrégé par campagne. Pour le détail par destinataire, consultez « Voir le détail » sur une
          campagne.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          className="input max-w-sm"
          placeholder="Rechercher une campagne..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : isError ? (
        <p className="text-red-600 dark:text-red-400">Impossible de charger le journal d'envoi.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Nom de la campagne" sortKey="name" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Statut" sortKey="status" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Envoyés" sortKey="sentCount" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Échecs" sortKey="failedCount" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Ouvertures" sortKey="openedCount" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Clics" sortKey="clickedCount" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Démarré le" sortKey="startedAt" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th scope="col" className="px-4 py-3">
                  <SortHeader label="Terminé le" sortKey="completedAt" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Aucune campagne ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {campaign.name}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge color={STATUS_COLORS[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{campaign.sentCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{campaign.failedCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{campaign.openedCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{campaign.clickedCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {formatDateTime(campaign.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                      {formatDateTime(campaign.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        to={`/campaigns/${campaign.id}/progress`}
                        className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Voir le détail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
