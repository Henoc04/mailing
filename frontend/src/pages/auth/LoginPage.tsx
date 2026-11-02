import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Logo } from "../../components/layout/Sidebar";
import { ThemeToggle } from "../../components/layout/ThemeToggle";

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  { icon: "users", title: "Contacts & segments", text: "Importez, organisez et ciblez votre audience." },
  { icon: "template", title: "Modèles personnalisés", text: "Des emails à vos couleurs, personnalisés pour chacun." },
  { icon: "chart", title: "Suivi en temps réel", text: "Envois, ouvertures et clics, campagne par campagne." },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Veuillez renseigner votre email et votre mot de passe.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch {
      setError("Email ou mot de passe incorrect.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full">
      {/* Brand panel — desktop only */}
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <Icon name="mail" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Mailing</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Vos campagnes d'emailing, simples et maîtrisées.
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon name={item.icon} />
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-brand-100/80">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-100/60">© {new Date().getFullYear()} Mailing</p>
      </div>

      {/* Form */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm animate-pop-in">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Bon retour 👋</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            Connectez-vous pour accéder à votre plateforme d'emailing.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className="input h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="input h-11 pr-20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPassword ? "Masquer" : "Afficher"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
              >
                <Icon name="alert" className="mt-px h-4 w-4" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              {isSubmitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
