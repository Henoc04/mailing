import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord", end: true },
  { to: "/contacts", label: "Contacts" },
  { to: "/company-search", label: "Recherche d'entreprises" },
  { to: "/segments", label: "Segments" },
  { to: "/templates", label: "Modèles" },
  { to: "/campaigns", label: "Campagnes" },
  { to: "/journal", label: "Journal d'envoi" },
  { to: "/smtp", label: "Comptes SMTP" },
  { to: "/drafts", label: "Brouillons" },
];

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-16 items-center px-4">
        <span className="text-lg font-bold text-brand-600 dark:text-brand-400">Mailing</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                "block rounded-md px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
        {user?.role === "ADMIN" && (
          <NavLink
            to="/settings/users"
            className={({ isActive }) =>
              clsx(
                "block rounded-md px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              )
            }
          >
            Utilisateurs
          </NavLink>
        )}
      </nav>
    </aside>
  );
}
