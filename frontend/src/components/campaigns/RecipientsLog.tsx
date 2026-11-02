import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as campaignsApi from "../../api/campaigns.api";
import type { RecipientLogItem, RecipientStatus } from "../../api/campaigns.api";
import { Badge, type BadgeColor } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Table, type TableColumn } from "../ui/Table";

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<RecipientStatus, string> = {
  PENDING: "En attente",
  SENDING: "En cours",
  SENT: "Envoyé",
  FAILED: "Échec",
  CANCELLED: "Annulé",
};

const STATUS_COLORS: Record<RecipientStatus, BadgeColor> = {
  PENDING: "gray",
  SENDING: "yellow",
  SENT: "green",
  FAILED: "red",
  CANCELLED: "gray",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

const COLUMNS: TableColumn<RecipientLogItem>[] = [
  {
    key: "recipient",
    header: "Destinataire",
    render: (r) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">{r.name || r.email}</p>
        {r.name && <p className="text-xs text-gray-500 dark:text-gray-400">{r.email}</p>}
      </div>
    ),
  },
  { key: "status", header: "Statut", render: (r) => <Badge color={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge> },
  { key: "sentAt", header: "Envoyé le", render: (r) => formatDateTime(r.sentAt) },
  {
    key: "opened",
    header: "Ouvert",
    render: (r) =>
      r.openedAt ? (
        <span title={`${r.openCount} ouverture(s)`}>{formatDateTime(r.openedAt)}</span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    key: "error",
    header: "Détail",
    render: (r) =>
      r.errorMessage ? (
        <span className="text-xs text-red-600 dark:text-red-400" title={r.errorMessage}>
          {r.errorMessage.length > 80 ? `${r.errorMessage.slice(0, 80)}…` : r.errorMessage}
          {r.attempts > 1 ? ` (${r.attempts} tentatives)` : ""}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
  },
];

export function RecipientsLog({ campaignId }: Readonly<{ campaignId: string }>) {
  const [status, setStatus] = useState<RecipientStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-recipients", campaignId, status, search, page],
    queryFn: () =>
      campaignsApi.listRecipients(campaignId, {
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    refetchInterval: 10000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Détail par destinataire</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-56"
            placeholder="Rechercher (nom, email)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="input w-40"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RecipientStatus | "");
              setPage(1);
            }}
          >
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_LABELS) as RecipientStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>
      ) : (
        <Table columns={COLUMNS} rows={data?.items ?? []} rowKey={(r) => r.id} emptyMessage="Aucun destinataire." />
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {data.total.toLocaleString("fr-FR")} destinataire(s) — page {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
