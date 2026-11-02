import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { LoginArt } from "./LoginArt";

interface DarkFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  trailing?: ReactNode;
}

/** Dark filled input; the label sits inside and shrinks to the top once focused or filled. */
function DarkField({ id, label, trailing, className, ...props }: DarkFieldProps) {
  return (
    <div className="relative">
      <input
        id={id}
        placeholder=" "
        className={`peer block h-14 w-full rounded-lg border border-transparent bg-[#3a3a40] px-4 pb-2 pt-6 text-[15px] text-white outline-none transition placeholder:text-transparent hover:bg-[#404047] focus:border-brand-400/70 focus:bg-[#404047] focus:ring-4 focus:ring-brand-500/20 ${className ?? ""}`}
        {...props}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-white/70 transition-all duration-150 peer-focus:top-[1.1rem] peer-focus:text-[11px] peer-focus:text-brand-200 peer-[:not(:placeholder-shown)]:top-[1.1rem] peer-[:not(:placeholder-shown)]:text-[11px]"
      >
        {label}
      </label>
      {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="0 0 64 52" className="h-12 w-auto" aria-hidden="true">
          <rect x="4" y="10" width="56" height="38" rx="7" fill="#f5f3ff" />
          <path d="M8 15 L32 33 L56 15" fill="none" stroke="#6366f1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 2 L60 8 L50 13 Z" fill="#f5f3ff" />
        </svg>
      </div>
      <span className="mt-1 text-xl font-extrabold tracking-tight text-white">Mailing</span>
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
  const [showForgotHint, setShowForgotHint] = useState(false);
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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#1c1b2e] p-4 sm:p-8">
      {/* Blurred, darkened copy of the illustration as the page background */}
      <LoginArt idPrefix="bg" className="absolute inset-0 h-full w-full scale-110 blur-md" />
      <div className="absolute inset-0 bg-[#16151f]/60" aria-hidden="true" />

      <div className="relative grid w-full max-w-[880px] animate-pop-in overflow-hidden rounded-[2rem] shadow-2xl shadow-black/50 md:min-h-[540px] md:grid-cols-2">
        {/* Illustration */}
        <div className="relative hidden md:block">
          <LoginArt idPrefix="card" className="absolute inset-0 h-full w-full" />
        </div>

        {/* Form panel */}
        <div className="flex flex-col bg-[#26262b] px-6 py-10 sm:px-12 md:-ml-6 md:w-[calc(100%+1.5rem)] md:rounded-l-[2rem]">
          <BrandMark />

          <h1 className="mt-7 text-[22px] font-medium leading-snug text-white">
            Bon retour, connectez-vous à votre compte
          </h1>

          <form
            onSubmit={handleSubmit}
            onAnimationEnd={() => setShaking(false)}
            className={`mt-6 ${shaking ? "login-shake" : ""}`}
            noValidate
          >
            <div className="space-y-3">
              <DarkField
                id="email"
                label="Adresse email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
              <DarkField
                id="password"
                label="Mot de passe"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                aria-invalid={Boolean(error) || undefined}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    <Icon name={showPassword ? "eyeSlash" : "eye"} />
                  </button>
                }
              />
            </div>

            <div className="mt-2 flex items-start justify-between gap-3 text-[11px]">
              <span className={capsLock ? "text-amber-300" : "invisible"}>Verr. Maj activée</span>
              <button
                type="button"
                onClick={() => setShowForgotHint((v) => !v)}
                className="text-white/70 transition hover:text-white"
                aria-expanded={showForgotHint}
              >
                Mot de passe oublié ?
              </button>
            </div>
            {showForgotHint && (
              <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                Contactez l'administrateur de la plateforme pour réinitialiser votre mot de passe.
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5 text-sm text-red-300 ring-1 ring-inset ring-red-400/20"
              >
                <Icon name="alert" className="mt-px h-4 w-4" />
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 min-w-[170px] items-center justify-center gap-2 rounded-xl bg-[#ececf1] px-8 text-lg font-semibold text-[#26262b] shadow-lg shadow-black/30 transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
              >
                {isSubmitting && <Spinner className="h-5 w-5" />}
                {isSubmitting ? "Connexion…" : "Se connecter"}
              </button>
            </div>
          </form>

          <p className="mt-auto pt-10 text-center text-sm text-white/80">
            Pas encore de compte ? <span className="font-semibold text-white">Demandez un accès</span> à votre
            administrateur.
          </p>
        </div>
      </div>
    </div>
  );
}
