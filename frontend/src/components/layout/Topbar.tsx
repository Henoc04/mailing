import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
      <div />
      <div className="flex items-center gap-4">
        {user && (
          <div className="text-right text-sm">
            <p className="font-medium text-gray-900 dark:text-gray-100">{user.fullName}</p>
            <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        )}
        <ThemeToggle />
        <Button variant="secondary" size="sm" onClick={logout}>
          Déconnexion
        </Button>
      </div>
    </header>
  );
}
