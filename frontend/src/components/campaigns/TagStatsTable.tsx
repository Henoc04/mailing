import { useQuery } from "@tanstack/react-query";
import * as campaignsApi from "../../api/campaigns.api";
import type { TagStat } from "../../api/campaigns.api";
import { Table, type TableColumn } from "../ui/Table";

const COLUMNS: TableColumn<TagStat>[] = [
  { key: "tag", header: "Groupe", render: (s) => <span className="font-medium">{s.tagName}</span> },
  { key: "recipients", header: "Destinataires", render: (s) => s.recipients.toLocaleString("fr-FR") },
  { key: "sent", header: "Envoyés", render: (s) => s.sent.toLocaleString("fr-FR") },
  { key: "failed", header: "Échecs", render: (s) => s.failed.toLocaleString("fr-FR") },
  { key: "opened", header: "Ouvertures", render: (s) => s.opened.toLocaleString("fr-FR") },
  {
    key: "rate",
    header: "Taux d'ouverture",
    render: (s) => (
      <div className="flex items-center gap-2">
        <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, s.openRate)}%` }} />
        </div>
        <span>{s.openRate.toLocaleString("fr-FR")} %</span>
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
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Résultats par groupe</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Un contact appartenant à plusieurs groupes est compté dans chacun d'eux.
      </p>
      <Table columns={COLUMNS} rows={data} rowKey={(s) => s.tagId ?? "none"} />
    </div>
  );
}
