import { useTheme } from "../../context/ThemeContext";
import { Icon } from "../ui/Icon";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Changer de thème"
      title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
