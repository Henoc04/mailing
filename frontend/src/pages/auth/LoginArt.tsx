// "Flat lay" illustration of the login page, drawn in SVG: a pile of small
// envelopes scattered on an indigo desk, a few paper planes and a large
// open envelope with its letter. Used crisp in the card and blurred as the
// page background. Positions are pseudo-random but deterministic.

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Piece {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  tone: string;
}

const ENVELOPE_TONES = ["#ffffff", "#eef2ff", "#e0e7ff", "#c7d2fe", "#fdf4ff", "#f5f3ff"];

// Envelopes heaped in a loose pile around the top-center, like the beans.
const PIECES: Piece[] = (() => {
  const rand = seeded(42);
  return Array.from({ length: 95 }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 0.7) * 230;
    return {
      x: 330 + Math.cos(angle) * radius * 1.05,
      y: 250 + Math.sin(angle) * radius * 0.85,
      rotate: rand() * 360,
      scale: 0.75 + rand() * 0.5,
      tone: ENVELOPE_TONES[Math.floor(rand() * ENVELOPE_TONES.length)],
    };
  });
})();

function SmallEnvelope({ x, y, rotate, scale, tone, ids }: Piece & { ids: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} filter={`url(#${ids}drop)`}>
      <rect x="-16" y="-11" width="32" height="22" rx="3" fill={tone} />
      <path d="M -15 -9.5 L 0 2 L 15 -9.5" fill="none" stroke="#6366f1" strokeOpacity="0.45" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  );
}

function PaperPlane({ x, y, rotate, size, ids }: { x: number; y: number; rotate: number; size: number; ids: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size})`} filter={`url(#${ids}drop-strong)`}>
      <path d="M -30 0 L 32 -22 L 8 26 L 0 6 Z" fill="#ffffff" />
      <path d="M 0 6 L 32 -22 L -6 2 Z" fill="#e0e7ff" />
      <path d="M 0 6 L 4 18 L 8 26 Z" fill="#c7d2fe" />
    </g>
  );
}

function OpenEnvelope({ ids }: { ids: string }) {
  return (
    <g transform="translate(150 560) rotate(-24)" filter={`url(#${ids}drop-strong)`}>
      {/* Letter sliding out */}
      <g transform="translate(0 -70) rotate(6)">
        <rect x="-85" y="-80" width="170" height="150" rx="6" fill="#ffffff" />
        <rect x="-62" y="-56" width="70" height="8" rx="4" fill="#6366f1" />
        <rect x="-62" y="-36" width="124" height="5" rx="2.5" fill="#cbd5e1" />
        <rect x="-62" y="-24" width="110" height="5" rx="2.5" fill="#cbd5e1" />
        <rect x="-62" y="-12" width="118" height="5" rx="2.5" fill="#cbd5e1" />
        <rect x="-62" y="6" width="54" height="16" rx="8" fill="#a855f7" />
      </g>
      {/* Envelope body */}
      <path d="M -110 -20 L 0 50 L 110 -20 L 110 80 Q 110 90 100 90 L -100 90 Q -110 90 -110 80 Z" fill="#f5f3ff" />
      <path d="M -110 80 L -20 20 M 110 80 L 20 20" stroke="#c7d2fe" strokeWidth="2" />
      {/* Wax seal with @ */}
      <circle cx="0" cy="50" r="22" fill="#4f46e5" />
      <circle cx="0" cy="50" r="17" fill="none" stroke="#818cf8" strokeWidth="1.5" />
      <text x="0" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="#ffffff" fontFamily="Inter, sans-serif">
        @
      </text>
    </g>
  );
}

export function LoginArt({ className, idPrefix }: { className?: string; idPrefix: string }) {
  // Prefix keeps SVG ids unique when the art is rendered twice on the page.
  const ids = `${idPrefix}-`;
  return (
    <svg
      className={className}
      viewBox="0 0 600 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${ids}desk`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d68e8" />
          <stop offset="0.55" stopColor="#5b54d6" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <radialGradient id={`${ids}light`} cx="0.3" cy="0.2" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${ids}grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0" />
        </filter>
        <filter id={`${ids}drop`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.6" floodColor="#1e1b4b" floodOpacity="0.45" />
        </filter>
        <filter id={`${ids}drop-strong`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="6" dy="10" stdDeviation="8" floodColor="#1e1b4b" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect width="600" height="720" fill={`url(#${ids}desk)`} />
      <rect width="600" height="720" fill={`url(#${ids}light)`} />
      <rect width="600" height="720" filter={`url(#${ids}grain)`} />

      {/* A pencil and a stamp, like the cinnamon sticks and star anise */}
      <g transform="translate(330 70) rotate(78)" filter={`url(#${ids}drop)`}>
        <rect x="-70" y="-5" width="140" height="10" rx="2" fill="#f59e0b" />
        <path d="M 70 -5 L 86 0 L 70 5 Z" fill="#fde68a" />
        <path d="M 80 -1.8 L 86 0 L 80 1.8 Z" fill="#1e293b" />
        <rect x="-78" y="-5" width="10" height="10" rx="2" fill="#f472b6" />
      </g>
      <g transform="translate(520 360) rotate(14)" filter={`url(#${ids}drop)`}>
        <rect x="-26" y="-32" width="52" height="64" fill="#ffffff" />
        <rect x="-20" y="-26" width="40" height="52" fill="#a855f7" />
        <circle cx="0" cy="-4" r="9" fill="#fde68a" />
        <path d="M -20 26 L -6 8 L 4 18 L 12 10 L 20 26 Z" fill="#7c3aed" />
      </g>
      <g transform="translate(110 150) rotate(-12)" filter={`url(#${ids}drop)`}>
        <rect x="-22" y="-27" width="44" height="54" fill="#ffffff" />
        <rect x="-17" y="-22" width="34" height="44" fill="#38bdf8" />
        <text x="0" y="7" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff" fontFamily="Inter, sans-serif">
          @
        </text>
      </g>

      {PIECES.map((piece, i) => (
        <SmallEnvelope key={i} ids={ids} {...piece} />
      ))}

      <PaperPlane ids={ids} x={250} y={170} rotate={-18} size={1.25} />
      <PaperPlane ids={ids} x={380} y={120} rotate={12} size={0.9} />
      <PaperPlane ids={ids} x={215} y={300} rotate={-40} size={0.7} />

      <OpenEnvelope ids={ids} />
    </svg>
  );
}
