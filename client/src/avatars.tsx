// Settler portraits: one per seat, in the seat's colour. A nod to the character portraits of
// the old Catan Online World, drawn as flat SVG medallions.
import type { ReactNode } from 'react';

const SKIN = ['#f1c9a1', '#d9a57a', '#9a6442', '#f3d2b3', '#b97f56', '#e6b48c'];
const TUNIC = ['#5a4632', '#596b30', '#4a3b2a', '#2e3f5c', '#6a2d4a', '#36505a'];
const INK = '#2b2112';

const HATS: ((skin: string) => ReactNode)[] = [
  // Viking: helmet, horns, beard
  () => (
    <>
      <path d="M16 24 C16 34 32 34 32 24 C29 28 19 28 16 24Z" fill="#c9792c" />
      <path d="M14.5 20 C14.5 10.5 33.5 10.5 33.5 20 Z" fill="#9aa3ad" stroke="#5d646c" strokeWidth="0.8" />
      <path d="M15.5 16.5 C10 15.5 7.5 10.5 8.5 5.5 C10.5 10 13 12 17.5 13 Z" fill="#efe3c4" stroke="#a89670" strokeWidth="0.6" />
      <path d="M32.5 16.5 C38 15.5 40.5 10.5 39.5 5.5 C37.5 10 35 12 30.5 13 Z" fill="#efe3c4" stroke="#a89670" strokeWidth="0.6" />
      <path d="M24 11 V20" stroke="#5d646c" strokeWidth="1.4" />
    </>
  ),
  // Farmer: straw hat
  () => (
    <>
      <ellipse cx="24" cy="15.5" rx="16" ry="3.6" fill="#e2b93b" stroke="#9a7514" strokeWidth="0.7" />
      <path d="M17 15.5 C17 7.5 31 7.5 31 15.5 Z" fill="#d6a92e" stroke="#9a7514" strokeWidth="0.7" />
      <rect x="17" y="12.6" width="14" height="2.2" fill="#8a4f1d" />
    </>
  ),
  // Hood
  () => (
    <path
      d="M11.5 30 C10 11 38 11 36.5 30 C36 35 33 37 31 37 L31 23 C31 15 17 15 17 23 L17 37 C15 37 12 35 11.5 30Z"
      fill="#6b4a2b"
      stroke="#3e2a17"
      strokeWidth="0.8"
    />
  ),
  // Sailor: tricorn
  () => (
    <>
      <path d="M16 15 C17 8 31 8 32 15 Z" fill="#23232a" />
      <path d="M9 16.5 C15 10.5 33 10.5 39 16.5 C33.5 15 28.5 17.5 24 15.2 C19.5 17.5 14.5 15 9 16.5Z" fill="#23232a" stroke="#d4a73a" strokeWidth="0.8" />
    </>
  ),
  // Noble: hair and crown
  () => (
    <>
      <path d="M14.5 23 C14 12 34 12 33.5 23 C31 17 17 17 14.5 23Z" fill="#5b3a1f" />
      <path d="M16.5 15 L16.5 7.5 L20.3 11.5 L24 5.5 L27.7 11.5 L31.5 7.5 L31.5 15 Z" fill="#e8c24a" stroke="#9c7420" strokeWidth="0.8" strokeLinejoin="round" />
      <circle cx="24" cy="12" r="1.2" fill="#c84a35" />
    </>
  ),
  // Fisher: knit cap
  () => (
    <>
      <path d="M15 19 C15 9 33 9 33 19 Z" fill="#c84a35" />
      <rect x="14.5" y="16.6" width="19" height="4.2" rx="2.1" fill="#a63a28" />
      <circle cx="24" cy="8.4" r="3" fill="#f4efe0" />
    </>
  ),
];

export function Avatar({
  seat,
  color,
  size = 44,
  fogged = false,
  title,
}: {
  seat: number;
  color: string;
  size?: number;
  fogged?: boolean;
  title?: string;
}) {
  const i = seat % HATS.length;
  const skin = SKIN[i];
  const clip = `av-clip-${i}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`avatar ${fogged ? 'fogged' : ''}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <circle cx="24" cy="24" r="22.5" />
        </clipPath>
        <radialGradient id={`av-bg-${i}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="23.5" fill={color} />
      <circle cx="24" cy="24" r="23.5" fill={`url(#av-bg-${i})`} />
      <g clipPath={`url(#${clip})`}>
        <path d="M7 49 C7 37 15 31.5 24 31.5 C33 31.5 41 37 41 49 Z" fill={TUNIC[i]} />
        <path d="M20 31.8 L24 36 L28 31.8" fill="none" stroke="#0004" strokeWidth="1.2" />
        <circle cx="24" cy="22.5" r="9" fill={skin} />
        <circle cx="20.6" cy="22.2" r="1.1" fill={INK} />
        <circle cx="27.4" cy="22.2" r="1.1" fill={INK} />
        <path d="M21.2 26.2 Q24 28.2 26.8 26.2" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
        {HATS[i](skin)}
      </g>
      <circle cx="24" cy="24" r="23" fill="none" stroke="#1c120c" strokeWidth="1.5" />
      {fogged && (
        <text x="24" y="31" textAnchor="middle" className="avatar-q">
          ?
        </text>
      )}
    </svg>
  );
}
