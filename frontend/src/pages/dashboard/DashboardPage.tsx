import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as dashboardApi from "../../api/dashboard.api";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import type { CampaignStatus } from "../../api/types";

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Planifiée",
  SENDING: "En cours d'envoi",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  FAILED: "Échouée",
};

const STATUS_COLORS: Record<CampaignStatus, BadgeColor> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  SENDING: "yellow",
  PAUSED: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  FAILED: "red",
};

interface StatCardProps {
  label: string;
  value: number;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="card">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {value.toLocaleString("fr-FR")}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardApi.getSummary,
  });

  if (isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Chargement...</p>;
  }

  if (isError || !data) {
    return (
      <p className="text-red-600 dark:text-red-400">
        Impossible de charger les statistiques du tableau de bord.
      </p>
    );
  }

  const chartData = [
    { name: "Envoyés", value: data.totalSent },
    { name: "Échecs", value: data.totalFailed },
    { name: "Ouvertures", value: data.totalOpened },
    { name: "Clics", value: data.totalClicked },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tableau de bord</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Emails envoyés" value={data.totalSent} />
        <StatCard label="Échecs" value={data.totalFailed} />
        <StatCard label="Ouvertures" value={data.totalOpened} />
        <StatCard label="Clics" value={data.totalClicked} />
        <StatCard label="Campagnes actives" value={data.activeCampaigns} />
        <StatCard label="Contacts totaux" value={data.totalContacts} />
      </div>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Activité globale
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" stroke="currentColor" className="text-xs text-gray-500 dark:text-gray-400" />
              <YAxis stroke="currentColor" className="text-xs text-gray-500 dark:text-gray-400" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--tooltip-bg, #1f2937)", border: "none", color: "#fff" }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Campagnes récentes
        </h2>

        {data.recentCampaigns.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucune campagne pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Nom
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Statut
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Progression
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.recentCampaigns.map((campaign) => {
                  // Rows for campaigns currently sending/paused link to the live
                  // progress view; other statuses link to the edit wizard, since
                  // there's nothing "in progress" to watch for those.
                  const linkTo =
                    campaign.status === "SENDING" || campaign.status === "PAUSED"
                      ? `/campaigns/${campaign.id}/progress`
                      : `/campaigns/${campaign.id}/edit`;
                  const progress =
                    campaign.totalRecipients > 0
                      ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
                      : 0;

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-3 text-sm">
                        <Link
                          to={linkTo}
                          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {campaign.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <Badge color={STATUS_COLORS[campaign.status]}>
                          {STATUS_LABELS[campaign.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {campaign.sentCount}/{campaign.totalRecipients}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
