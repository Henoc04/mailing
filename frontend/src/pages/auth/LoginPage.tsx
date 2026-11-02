import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { ThemeToggle } from "../../components/layout/ThemeToggle";
import { LoginArt } from "./LoginArt";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 18) {
    return "Bonsoir";
  }
  return "Bonjour";
}

interface FloatingFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: IconName;
  trailing?: ReactNode;
}

/** Input whose label sits inside the field and floats up on focus/fill. */
function FloatingField({ id, label, icon, trailing, className, ...props }: FloatingFieldProps) {
  return (
    <div className="group relative">
      <Icon
        name={icon}
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-brand-500"
      />
      <input
        id={id}
        placeholder=" "
        className={`peer block h-14 w-full rounded-2xl border border-gray-200 bg-white pb-2 pl-12 pr-4 pt-6 text-[15px] text-gray-900 shadow-sm outline-none transition placeholder:text-transparent hover:border-gray-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:hover:border-gray-700 ${className ?? ""}`}
        {...props}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-[15px] text-gray-500 transition-all duration-150 peer-focus:top-4 peer-focus:text-xs peer-focus:font-medium peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-medium dark:text-gray-400 dark:peer-focus:text-brand-400"
      >
        {label}
      </label>
      {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
    </div>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);

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
      setShaking(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch {
      setError("Email ou mot de passe incorrect.");
      setShaking(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white dark:bg-gray-950 lg:flex-row">
      {/* Art: compact band on phones/tablets, full panel on desktop */}
      <div className="h-56 shrink-0 sm:h-64 lg:hidden">
        <LoginArt compact />
      </div>
      <div className="hidden lg:block lg:w-[52%] lg:p-3">
        <div className="h-full overflow-hidden rounded-[1.75rem]">
          <LoginArt />
        </div>
      </div>

      {/* Form */}
      <main className="relative -mt-8 flex flex-1 flex-col rounded-t-[1.75rem] bg-white px-6 pb-10 pt-8 dark:bg-gray-950 sm:px-10 lg:mt-0 lg:rounded-none lg:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white">
              <Icon name="mail" className="h-[18px] w-[18px]" />
            </div>
            <span className="font-semibold tracking-tight text-gray-900 dark:text-white">Mailing</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <div className="animate-pop-in">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Espace d'envoi
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              {greeting()}, ravi de vous revoir.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Connectez-vous pour retrouver vos campagnes, contacts et statistiques.
            </p>

            <form
              onSubmit={handleSubmit}
              onAnimationEnd={() => setShaking(false)}
              className={`mt-8 space-y-4 ${shaking ? "login-shake" : ""}`}
              noValidate
            >
              <FloatingField
                id="email"
                label="Adresse email"
                icon="mail"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />

              <FloatingField
                id="password"
                label="Mot de passe"
                icon="lock"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-24"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                aria-invalid={Boolean(error) || undefined}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Masquer" : "Afficher"}
                  </button>
                }
              />

              {capsLock && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Icon name="info" className="h-4 w-4" />
                  La touche Verr. Maj est activée.
                </p>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20"
                >
                  <Icon name="alert" className="mt-px h-4 w-4" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="login-shine group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-600 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:shadow-xl hover:shadow-brand-600/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
              >
                {isSubmitting ? (
                  <>
                    <Spinner className="h-5 w-5" />
                    Connexion…
                  </>
                ) : (
                  <>
                    Se connecter
                    <Icon name="send" className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <Icon name="shield" className="h-4 w-4" />
              Connexion chiffrée · accès réservé aux membres de l'équipe
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
