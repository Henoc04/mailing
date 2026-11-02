import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { ThemeToggle } from "./ThemeToggle";
import { NAV_SECTIONS } from "./Sidebar";

function currentSectionLabel(pathname: string): string {
  const items = NAV_SECTIONS.flatMap((section) => section.items);
  const match = items
    .filter((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? "";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/80 px-4 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="-ml-2 rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Icon name="menu" className="h-6 w-6" />
      </button>

      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-500 dark:text-gray-400">
        {currentSectionLabel(pathname)}
      </p>

      <ThemeToggle />

      {user && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-gray-100 dark:hover:bg-gray-800 sm:pr-2"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-semibold text-white">
              {initials(user.fullName) || "?"}
            </span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-gray-700 dark:text-gray-200 sm:block">
              {user.fullName}
            </span>
            <Icon name="chevronDown" className="hidden h-4 w-4 text-gray-400 sm:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 origin-top-right animate-pop-in rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user.fullName}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
              </div>
              <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Icon name="logout" className="h-4 w-4 text-gray-400" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
