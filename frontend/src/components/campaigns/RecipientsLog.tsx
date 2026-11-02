import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as campaignsApi from "../../api/campaigns.api";
import type { RecipientLogItem, RecipientStatus } from "../../api/campaigns.api";
import { Badge, type BadgeColor } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { LoadingState } from "../ui/States";
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

function ErrorDetail({ r }: { r: RecipientLogItem }) {
  if (!r.errorMessage) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  return (
    <span className="break-words text-xs text-red-600 dark:text-red-400" title={r.errorMessage}>
      {r.errorMessage.length > 80 ? `${r.errorMessage.slice(0, 80)}…` : r.errorMessage}
      {r.attempts > 1 ? ` (${r.attempts} tentatives)` : ""}
    </span>
  );
}

const COLUMNS: TableColumn<RecipientLogItem>[] = [
  {
    key: "recipient",
    header: "Destinataire",
    render: (r) => (
      <div className="min-w-0 max-w-[16rem] sm:max-w-xs">
        <p className="truncate font-medium text-gray-900 dark:text-gray-100" title={r.name || r.email}>
          {r.name || r.email}
        </p>
        {r.name && (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={r.email}>
            {r.email}
          </p>
        )}
        {/* Columns hidden on small screens are repeated here. */}
        <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400 md:hidden">
          {r.sentAt && <p>Envoyé le {formatDateTime(r.sentAt)}</p>}
          {r.openedAt && <p title={`${r.openCount} ouverture(s)`}>Ouvert le {formatDateTime(r.openedAt)}</p>}
        </div>
        {r.errorMessage && (
          <div className="mt-1 whitespace-normal lg:hidden">
            <ErrorDetail r={r} />
          </div>
        )}
      </div>
    ),
  },
  {
    key: "status",
    header: "Statut",
    render: (r) => (
      <Badge dot color={STATUS_COLORS[r.status]}>
        {STATUS_LABELS[r.status]}
      </Badge>
    ),
  },
  {
    key: "sentAt",
    header: "Envoyé le",
    hideBelow: "md",
    className: "whitespace-nowrap",
    render: (r) => formatDateTime(r.sentAt),
  },
  {
    key: "opened",
    header: "Ouvert",
    hideBelow: "md",
    className: "whitespace-nowrap",
    render: (r) =>
      r.openedAt ? (
        <span title={`${r.openCount} ouverture(s)`}>{formatDateTime(r.openedAt)}</span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">—</span>
      ),
  },
  {
    key: "error",
    header: "Détail",
    hideBelow: "lg",
    className: "max-w-xs",
    render: (r) => <ErrorDetail r={r} />,
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
    <section className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="section-title">Détail par destinataire</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              className="input pl-9"
              placeholder="Rechercher (nom, email)"
              aria-label="Rechercher un destinataire"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-44"
            aria-label="Filtrer par statut"
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
        <div className="card">
          <LoadingState />
        </div>
      ) : (
        <Table columns={COLUMNS} rows={data?.items ?? []} rowKey={(r) => r.id} emptyMessage="Aucun destinataire." />
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular-nums">
            {data.total.toLocaleString("fr-FR")} destinataire(s) — page {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
              Précédent
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
              <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
