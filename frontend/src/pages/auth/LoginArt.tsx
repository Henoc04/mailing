import { useEffect, useState } from "react";
import { Icon, type IconName } from "../../components/ui/Icon";

// Decorative scene of the login page: a night sky where paper planes fly
// along dashed routes, and a glass card showing a campaign "going out" live.
// Everything here is fake, illustrative data.

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Eases a number from 0 to `target` once, on mount. */
function useCountUp(target: number, durationMs = 1600): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

const ROUTES = [
  "M -40 620 C 120 560, 180 380, 330 360 S 560 220, 660 120",
  "M -40 760 C 160 700, 300 640, 380 520 S 520 300, 660 300",
  "M -40 300 C 80 260, 160 140, 300 150 S 500 90, 660 -20",
];

const STARS = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 137.5) % 600,
  y: (i * 89.3) % 800,
  r: i % 5 === 0 ? 1.6 : 1,
  delay: (i % 7) * 0.6,
}));

interface Notice {
  icon: IconName;
  tone: string;
  text: string;
}

const NOTICES: Notice[] = [
  { icon: "mailOpen", tone: "text-emerald-300", text: "Camille D. a ouvert « Offre de novembre »" },
  { icon: "cursor", tone: "text-amber-300", text: "Nouveau clic sur « Découvrir l'offre »" },
  { icon: "checkCircle", tone: "text-sky-300", text: "250 emails délivrés avec succès" },
  { icon: "mailOpen", tone: "text-emerald-300", text: "Julien M. a ouvert « Offre de novembre »" },
  { icon: "users", tone: "text-violet-300", text: "12 nouveaux contacts ajoutés au segment" },
  { icon: "cursor", tone: "text-amber-300", text: "Nouveau clic depuis Lyon" },
];

function FlightScene({ animate }: { animate: boolean }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {STARS.map((star, i) => (
        <circle
          key={i}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill="white"
          className="login-star"
          style={{ animationDelay: `${star.delay}s` }}
        />
      ))}
      {ROUTES.map((d) => (
        <path key={d} d={d} fill="none" stroke="white" strokeOpacity="0.16" strokeWidth="1.5" strokeDasharray="2 9" strokeLinecap="round" />
      ))}
      {animate &&
        ROUTES.map((d, i) => (
          <g key={`plane-${d}`}>
            <g>
              <path d="M -7 -6 L 11 0 L -7 6 L -3 0 Z" fill="white" />
              <path d="M -3 0 L 11 0" stroke="#c7d2fe" strokeWidth="1" />
              <animateMotion dur={`${8 + i * 2.5}s`} begin={`${i * 1.7}s`} repeatCount="indefinite" rotate="auto" path={d} />
            </g>
          </g>
        ))}
    </svg>
  );
}

function LiveCampaignCard() {
  const sent = useCountUp(1248);
  const openRate = useCountUp(42.3);
  const clickRate = useCountUp(12.8);
  const progress = useCountUp(78, 2200);

  return (
    <div className="login-float w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.07] p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">Campagne</p>
          <p className="truncate font-semibold">Offre de novembre</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          En cours
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-xs text-white/60">
          <span>Progression</span>
          <span className="tabular-nums text-white">{Math.round(progress)} %</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-brand-400 to-fuchsia-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: "Envoyés", value: Math.round(sent).toLocaleString("fr-FR") },
          { label: "Ouvertures", value: `${openRate.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %` },
          { label: "Clics", value: `${clickRate.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-inset ring-white/10">
            <dt className="text-[11px] text-white/50">{stat.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {/* Mini activity chart */}
      <div className="mt-5 flex h-12 items-end gap-1" aria-hidden="true">
        {[30, 45, 38, 60, 52, 75, 64, 88, 70, 95, 82, 100].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-brand-500/40 to-brand-300/90 transition-all duration-1000"
            style={{ height: `${Math.min(h, (progress / 78) * h)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function NoticeFeed({ animate }: { animate: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!animate) {
      return;
    }
    const id = window.setInterval(() => setIndex((i) => i + 1), 2800);
    return () => window.clearInterval(id);
  }, [animate]);

  // Latest notice on top; keys change so each new one replays the entrance.
  const visible = [0, 1, 2].map((offset) => {
    const n = index - offset;
    return { key: n, notice: NOTICES[((n % NOTICES.length) + NOTICES.length) % NOTICES.length] };
  });

  return (
    <ul className="w-full max-w-sm space-y-2" aria-hidden="true">
      {visible.map(({ key, notice }, position) => (
        <li
          key={key}
          className="login-toast flex items-center gap-3 rounded-xl border border-white/10 bg-gray-950/50 px-3.5 py-2.5 text-sm text-white/90 shadow-lg backdrop-blur-md transition-opacity duration-500"
          style={{ opacity: 1 - position * 0.3 }}
        >
          <Icon name={notice.icon} className={`h-4 w-4 ${notice.tone}`} />
          <span className="min-w-0 flex-1 truncate">{notice.text}</span>
          <span className="text-[11px] text-white/40">{position === 0 ? "à l'instant" : `il y a ${position * 3} s`}</span>
        </li>
      ))}
    </ul>
  );
}

/** Full art panel (desktop) or a compact hero band (phones) via `compact`. */
export function LoginArt({ compact = false }: { compact?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="relative isolate h-full overflow-hidden bg-[#070818]">
      {/* Aurora */}
      <div className="login-aurora absolute -left-1/4 -top-1/4 h-[70%] w-[80%] rounded-full bg-brand-600/50 blur-[110px]" />
      <div
        className="login-aurora absolute -bottom-1/4 -right-1/4 h-[70%] w-[80%] rounded-full bg-fuchsia-600/35 blur-[120px]"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="login-aurora absolute left-1/3 top-1/3 h-[40%] w-[50%] rounded-full bg-sky-500/25 blur-[100px]"
        style={{ animationDelay: "-11s" }}
      />
      {/* Dot grid, faded at the edges */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: "radial-gradient(rgb(255 255 255 / 0.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      <FlightScene animate={!reducedMotion} />

      {compact ? (
        <div className="relative flex h-full flex-col justify-end p-6 pb-14 text-white">
          <p className="text-2xl font-semibold leading-tight tracking-tight">
            Chaque email,
            <br />
            <span className="bg-gradient-to-r from-sky-300 via-brand-200 to-fuchsia-300 bg-clip-text text-transparent">
              au bon destinataire.
            </span>
          </p>
        </div>
      ) : (
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <Icon name="mail" className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Mailing</span>
          </div>

          <div className="flex flex-col items-center gap-5">
            <NoticeFeed animate={!reducedMotion} />
            <LiveCampaignCard />
          </div>

          <div>
            <p className="max-w-md text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
              Chaque email,{" "}
              <span className="bg-gradient-to-r from-sky-300 via-brand-200 to-fuchsia-300 bg-clip-text text-transparent">
                au bon destinataire.
              </span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
              Ciblez vos contacts, personnalisez vos messages et suivez chaque ouverture en temps réel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
