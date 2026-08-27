/** Lightweight produce-basket mark for cart UI (no external asset). */

type Tone = 'color' | 'onPrimary';

export function CartBasketIcon({
  className = 'h-5 w-5',
  decorative = true,
  tone = 'color',
}: {
  className?: string;
  decorative?: boolean;
  tone?: Tone;
}) {
  const isOnPrimary = tone === 'onPrimary';
  const stroke = isOnPrimary ? '#ffffff' : '#15803d';
  const body = isOnPrimary ? 'rgba(255,255,255,0.18)' : '#dcfceb';
  const weave = isOnPrimary ? 'rgba(255,255,255,0.45)' : '#86efac';
  const fruitA = isOnPrimary ? '#ffffff' : '#4ade80';
  const fruitB = isOnPrimary ? 'rgba(255,255,255,0.85)' : '#f97316';
  const fruitC = isOnPrimary ? 'rgba(255,255,255,0.7)' : '#ef4444';

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
    >
      {!decorative ? <title>Carrito</title> : null}
      <path
        d="M10 28h44l-3.2 22.4A6 6 0 0 1 44.9 56H19.1a6 6 0 0 1-5.9-5.6L10 28Z"
        fill={body}
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M16 36h32M15 44h34" stroke={weave} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M20 28c0-8 5.5-14 12-14s12 6 12 14"
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="28" cy="24" r="5" fill={fruitA} stroke={stroke} strokeWidth="1.4" />
      <circle cx="38" cy="22" r="4.2" fill={fruitB} stroke={stroke} strokeWidth="1.3" />
      <circle cx="33" cy="18" r="3.4" fill={fruitC} stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}
