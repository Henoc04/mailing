import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { Icon, type IconName } from "../ui/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: "/", label: "Tableau de bord", icon: "home", end: true }],
  },
  {
    title: "Audience",
    items: [
      { to: "/contacts", label: "Contacts", icon: "users" },
      { to: "/segments", label: "Segments", icon: "funnel" },
      { to: "/company-search", label: "Recherche d'entreprises", icon: "building" },
    ],
  },
  {
    title: "Envois",
    items: [
      { to: "/campaigns", label: "Campagnes", icon: "send" },
      { to: "/templates", label: "Modèles", icon: "template" },
      { to: "/drafts", label: "Brouillons", icon: "draft" },
      { to: "/journal", label: "Journal d'envoi", icon: "journal" },
    ],
  },
  {
    title: "Paramètres",
    items: [
      { to: "/smtp", label: "Comptes SMTP", icon: "server" },
      { to: "/settings/users", label: "Utilisateurs", icon: "shield", adminOnly: true },
    ],
  },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md shadow-brand-500/30">
        <Icon name="mail" className="h-[18px] w-[18px]" />
      </div>
      <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">Mailing</span>
    </div>
  );
}

interface SidebarProps {
  /** Phone/tablet drawer state; the sidebar is always visible from `lg`. */
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-gray-950/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200/80 bg-white transition-transform duration-200 ease-out dark:border-gray-800 dark:bg-gray-900 lg:static lg:z-auto lg:w-64 lg:translate-x-0",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
        aria-label="Navigation principale"
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
            aria-label="Fermer le menu"
          >
            <Icon name="x" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
          {NAV_SECTIONS.map((section, index) => {
            const items = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={section.title ?? index}>
                {section.title && (
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {section.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onClose}
                        className={({ isActive }) =>
                          clsx(
                            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              name={item.icon}
                              className={clsx(
                                "transition-colors",
                                isActive
                                  ? "text-brand-600 dark:text-brand-400"
                                  : "text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
