import { useQuery } from "@tanstack/react-query";
import * as campaignsApi from "../../api/campaigns.api";
import type { TagStat } from "../../api/campaigns.api";
import { Table, type TableColumn } from "../ui/Table";

const COLUMNS: TableColumn<TagStat>[] = [
  {
    key: "tag",
    header: "Groupe",
    render: (s) => (
      <div className="min-w-0">
        <span className="break-words font-medium text-gray-900 dark:text-gray-100">{s.tagName}</span>
        {/* Counts hidden on phones are summarised here instead. */}
        <p className="mt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 md:hidden">
          {s.recipients.toLocaleString("fr-FR")} dest. · {s.sent.toLocaleString("fr-FR")} envoyés ·{" "}
          {s.failed.toLocaleString("fr-FR")} échecs · {s.opened.toLocaleString("fr-FR")} ouvertures
        </p>
      </div>
    ),
  },
  {
    key: "recipients",
    header: "Destinataires",
    hideBelow: "md",
    className: "tabular-nums",
    render: (s) => s.recipients.toLocaleString("fr-FR"),
  },
  { key: "sent", header: "Envoyés", hideBelow: "md", className: "tabular-nums", render: (s) => s.sent.toLocaleString("fr-FR") },
  {
    key: "failed",
    header: "Échecs",
    hideBelow: "md",
    className: "tabular-nums",
    render: (s) => s.failed.toLocaleString("fr-FR"),
  },
  {
    key: "opened",
    header: "Ouvertures",
    hideBelow: "md",
    className: "tabular-nums",
    render: (s) => s.opened.toLocaleString("fr-FR"),
  },
  {
    key: "rate",
    header: "Taux d'ouverture",
    render: (s) => (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 sm:w-20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
            style={{ width: `${Math.min(100, s.openRate)}%` }}
          />
        </div>
        <span className="whitespace-nowrap tabular-nums">{s.openRate.toLocaleString("fr-FR")} %</span>
      </div>
    ),
  },
];

/** Per-group (tag) breakdown of a campaign's results. Hidden until the campaign has recipients. */
export function TagStatsTable({ campaignId }: Readonly<{ campaignId: string }>) {
  const { data } = useQuery({
    queryKey: ["campaign-stats-by-tag", campaignId],
    queryFn: () => campaignsApi.statsByTag(campaignId),
    refetchInterval: 15000,
  });

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-title">Résultats par groupe</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Un contact appartenant à plusieurs groupes est compté dans chacun d'eux.
        </p>
      </div>
      <Table columns={COLUMNS} rows={data} rowKey={(s) => s.tagId ?? "none"} />
    </section>
  );
}
