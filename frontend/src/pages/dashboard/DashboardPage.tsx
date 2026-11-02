import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as dashboardApi from "../../api/dashboard.api";
import { Badge, type BadgeColor } from "../../components/ui/Badge";
import { Icon, type IconName } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState, LoadingState } from "../../components/ui/States";
import { useAuth } from "../../context/AuthContext";
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

type Tone = "brand" | "red" | "emerald" | "amber" | "violet" | "sky";

const TONE_CLASSES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
};

interface StatCardProps {
  label: string;
  value: number;
  icon: IconName;
  tone: Tone;
  hint?: string;
}

function StatCard({ label, value, icon, tone, hint }: StatCardProps) {
  return (
    <div className="card flex items-start gap-4">
      <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[tone])}>
        <Icon name={icon} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
          {value.toLocaleString("fr-FR")}
        </p>
        {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

function rate(part: number, total: number): string | undefined {
  if (total <= 0) {
    return undefined;
  }
  return `${((part / total) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des envois`;
}

const CHART_COLORS = ["#6366f1", "#ef4444", "#10b981", "#f59e0b"];

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardApi.getSummary,
  });

  const firstName = user?.fullName.split(" ")[0];

  const header = (
    <PageHeader
      title={firstName ? `Bonjour ${firstName}` : "Tableau de bord"}
      description="Vue d'ensemble de votre activité d'emailing."
      actions={
        <Link to="/campaigns/new" className="btn h-10 bg-brand-600 px-4 text-sm text-white shadow-sm hover:bg-brand-500">
          <Icon name="plus" className="h-4 w-4" />
          Nouvelle campagne
        </Link>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingState />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState>Impossible de charger les statistiques du tableau de bord.</ErrorState>
      </div>
    );
  }

  const chartData = [
    { name: "Envoyés", value: data.totalSent },
    { name: "Échecs", value: data.totalFailed },
    { name: "Ouvertures", value: data.totalOpened },
    { name: "Clics", value: data.totalClicked },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Emails envoyés" value={data.totalSent} icon="send" tone="brand" />
        <StatCard
          label="Ouvertures"
          value={data.totalOpened}
          icon="mailOpen"
          tone="emerald"
          hint={rate(data.totalOpened, data.totalSent)}
        />
        <StatCard
          label="Clics"
          value={data.totalClicked}
          icon="cursor"
          tone="amber"
          hint={rate(data.totalClicked, data.totalSent)}
        />
        <StatCard label="Échecs" value={data.totalFailed} icon="alert" tone="red" />
        <StatCard label="Campagnes actives" value={data.activeCampaigns} icon="bolt" tone="violet" />
        <StatCard label="Contacts" value={data.totalContacts} icon="users" tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="card xl:col-span-2">
          <h2 className="section-title">Activité globale</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Tous envois confondus</p>
          <div className="mt-6 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -16, right: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  stroke="currentColor"
                  className="text-xs text-gray-500 dark:text-gray-400"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  stroke="currentColor"
                  className="text-xs text-gray-500 dark:text-gray-400"
                />
                <Tooltip
                  cursor={{ fill: "rgb(148 163 184 / 0.12)" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) => [value.toLocaleString("fr-FR"), ""]}
                  separator=""
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-0 sm:p-0 xl:col-span-3">
          <div className="flex items-center justify-between px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <h2 className="section-title">Campagnes récentes</h2>
            <Link to="/campaigns" className="link text-sm">
              Tout voir
            </Link>
          </div>

          {data.recentCampaigns.length === 0 ? (
            <EmptyState
              icon="send"
              title="Aucune campagne pour le moment"
              description="Créez votre première campagne pour commencer à envoyer."
              action={
                <Link to="/campaigns/new" className="link text-sm">
                  Créer une campagne
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
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
                  <li key={campaign.id}>
                    <Link
                      to={linkTo}
                      className="flex flex-col gap-2 px-4 py-3.5 transition hover:bg-gray-50 dark:hover:bg-gray-800/40 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {campaign.name}
                        </span>
                        <Badge dot color={STATUS_COLORS[campaign.status]}>
                          {STATUS_LABELS[campaign.status]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 sm:w-56">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {campaign.sentCount}/{campaign.totalRecipients}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
