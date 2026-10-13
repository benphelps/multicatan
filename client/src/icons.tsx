// Hand-drawn SVG icon set on a 24×24 grid. Glyphs use currentColor so they sit on any swatch.
import type { ReactNode, SVGProps } from 'react';
import type { Resource, Terrain } from '../../shared/types.ts';

type IconProps = { size?: number | string; title?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Svg({ size = 24, title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ---------- resources ----------

const RESOURCE_GLYPHS: Record<Resource, ReactNode> = {
  brick: (
    <g fill="currentColor">
      <rect x="2.5" y="5" width="8.5" height="4.2" rx="0.7" />
      <rect x="12.2" y="5" width="9.3" height="4.2" rx="0.7" />
      <rect x="2.5" y="10.4" width="4" height="4.2" rx="0.7" />
      <rect x="7.7" y="10.4" width="8.6" height="4.2" rx="0.7" />
      <rect x="17.5" y="10.4" width="4" height="4.2" rx="0.7" />
      <rect x="2.5" y="15.8" width="8.5" height="4.2" rx="0.7" />
      <rect x="12.2" y="15.8" width="9.3" height="4.2" rx="0.7" />
    </g>
  ),
  lumber: (
    <g>
      {[
        [7, 16.5],
        [17, 16.5],
        [12, 8.2],
      ].map(([cx, cy]) => (
        <g key={`${cx}`}>
          <circle cx={cx} cy={cy} r="4.6" fill="currentColor" />
          <circle cx={cx} cy={cy} r="2.7" fill="none" stroke="var(--icon-bg, #0004)" strokeWidth="0.9" />
          <circle cx={cx} cy={cy} r="0.9" fill="var(--icon-bg, #0004)" />
        </g>
      ))}
    </g>
  ),
  wool: (
    <g>
      <g fill="currentColor">
        <circle cx="8" cy="11.5" r="3.6" />
        <circle cx="12" cy="9.3" r="3.8" />
        <circle cx="15.6" cy="11.4" r="3.4" />
        <circle cx="11.6" cy="13.6" r="4" />
        <circle cx="6.6" cy="14.4" r="2.8" />
        <circle cx="16" cy="14.6" r="2.8" />
      </g>
      <g fill="var(--icon-ink, #2b2112)">
        <ellipse cx="19.4" cy="10.6" rx="2.3" ry="2.9" />
        <rect x="7.6" y="17" width="1.6" height="4" rx="0.6" />
        <rect x="11" y="17.6" width="1.6" height="3.6" rx="0.6" />
        <rect x="14.6" y="17" width="1.6" height="4" rx="0.6" />
      </g>
    </g>
  ),
  grain: (
    <g fill="currentColor">
      <path d="M11.4 21.5 C11.6 15 11.9 9 12.2 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {[5, 8.3, 11.6, 14.9].map((y) => (
        <g key={y}>
          <ellipse cx="9.4" cy={y + 0.6} rx="1.5" ry="2.8" transform={`rotate(-32 9.4 ${y + 0.6})`} />
          <ellipse cx="14.3" cy={y + 0.6} rx="1.5" ry="2.8" transform={`rotate(32 14.3 ${y + 0.6})`} />
        </g>
      ))}
      <ellipse cx="12.1" cy="3.4" rx="1.3" ry="2.4" />
    </g>
  ),
  ore: (
    <g>
      <path d="M2.5 19.5 L6.5 11 L10.5 8.5 L13 4.5 L18 8 L21.5 14.5 L20 19.5 Z" fill="currentColor" />
      <path d="M6.5 11 L11 13 L13 4.5 M11 13 L15.5 12 L18 8 M15.5 12 L20 19.5 M11 13 L9.5 19.5" fill="none" stroke="var(--icon-bg, #0004)" strokeWidth="1" strokeLinejoin="round" />
    </g>
  ),
};

export function ResourceIcon({ res, ...p }: IconProps & { res: Resource }) {
  return <Svg {...p}>{RESOURCE_GLYPHS[res]}</Svg>;
}

// ---------- pieces & cards ----------

export const GLYPHS = {
  settlement: <path d="M4 20.5 V11 L12 3.5 L20 11 V20.5 Z" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.4" strokeLinejoin="round" />,
  city: (
    <path
      d="M2 21 V11 H8 V7 L13.5 2.5 L19 7 V11 H22 V21 Z"
      fill="currentColor"
      stroke="var(--icon-ink, #10232a)"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
  road: (
    <g transform="rotate(-35 12 12)">
      <rect x="2" y="9" width="20" height="6" rx="1.4" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
      <path d="M7 9 V15 M12 9 V15 M17 9 V15" stroke="var(--icon-ink, #10232a)" strokeOpacity="0.45" strokeWidth="1" />
    </g>
  ),
  ship: (
    <g strokeLinejoin="round">
      <path d="M2.5 15 H21.5 L18 20.5 H6 Z" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
      <path d="M12 2.5 V15" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
      <path d="M12.8 3.5 L19.5 13 H12.8 Z" fill="#f4efe0" stroke="var(--icon-ink, #10232a)" strokeWidth="1.1" />
      <path d="M11.2 6 L6 13 H11.2 Z" fill="#f4efe0" stroke="var(--icon-ink, #10232a)" strokeWidth="1.1" />
    </g>
  ),
  knight: (
    <g strokeLinejoin="round">
      <path d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.5 19.8 12 21.5 C7.5 19.8 4 16.5 4 11.5 V5.5 Z" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
      <path d="M12 6 V17 M8 10.5 H16" stroke="var(--icon-ink, #10232a)" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  roadBuilding: (
    <g transform="rotate(-35 12 12)" stroke="var(--icon-ink, #10232a)" strokeWidth="1.2" strokeLinejoin="round">
      <rect x="1.5" y="4" width="21" height="5.5" rx="1.2" fill="currentColor" />
      <rect x="1.5" y="14.5" width="21" height="5.5" rx="1.2" fill="currentColor" />
      <path d="M8 4 V9.5 M15 4 V9.5 M8 14.5 V20 M15 14.5 V20" strokeOpacity="0.45" strokeWidth="1" />
    </g>
  ),
  victoryPoint: (
    <path
      d="M12 2.5 L14.6 8.6 L21.2 9.2 L16.2 13.5 L17.7 20 L12 16.6 L6.3 20 L7.8 13.5 L2.8 9.2 L9.4 8.6 Z"
      fill="currentColor"
      stroke="var(--icon-ink, #10232a)"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  ),
  card: (
    <g>
      <rect x="5" y="2.5" width="14" height="19" rx="2" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
      <path d="M12 7 L16 12 L12 17 L8 12 Z" fill="var(--icon-ink, #10232a)" opacity="0.5" />
    </g>
  ),
  treasure: (
    <g strokeLinejoin="round" stroke="#5b3d0b" strokeWidth="1.2">
      <path d="M3 11 H21 V20 H3 Z" fill="#e0b12f" />
      <path d="M3 11 C3 5.5 21 5.5 21 11 Z" fill="#f0c845" />
      <path d="M3 13.5 H21" />
      <rect x="10.3" y="11.5" width="3.4" height="4.4" rx="0.6" fill="#5b3d0b" />
    </g>
  ),
  robber: (
    <g fill="#34343c" stroke="#101016" strokeWidth="1.2" strokeLinejoin="round">
      <circle cx="12" cy="6.5" r="4" />
      <path d="M6 21 C6 14 8.5 10.5 12 10.5 C15.5 10.5 18 14 18 21 Z" />
    </g>
  ),
  anchor: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2 V20.5 M8 11 H16 M4.5 14 C5 18 8 20.5 12 20.5 C16 20.5 19 18 19.5 14" />
    </g>
  ),
  trade: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5 H18 M14.5 5 L18 8.5 L14.5 12" />
      <path d="M20 15.5 H6 M9.5 12 L6 15.5 L9.5 19" />
    </g>
  ),
  hourglass: (
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M6 3 H18 M6 21 H18" />
      <path d="M7.5 3 C7.5 9 16.5 9 16.5 12 C16.5 15 7.5 15 7.5 21 M16.5 3 C16.5 9 7.5 9 7.5 12 C7.5 15 16.5 15 16.5 21" />
      <path d="M9.5 19.5 C10 17.5 14 17.5 14.5 19.5 Z" fill="currentColor" stroke="none" />
    </g>
  ),
  moveShip: (
    <g>
      <g transform="translate(-2 2) scale(0.85)">
        <path d="M2.5 15 H21.5 L18 20.5 H6 Z" fill="currentColor" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M12 2.5 V15" stroke="var(--icon-ink, #10232a)" strokeWidth="1.3" />
        <path d="M12.8 3.5 L19.5 13 H12.8 Z" fill="#f4efe0" stroke="var(--icon-ink, #10232a)" strokeWidth="1.1" />
      </g>
      <path d="M17 4 H22 M19.5 1.8 L22 4 L19.5 6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof GLYPHS;

export function Icon({ name, ...p }: IconProps & { name: GlyphName }) {
  return <Svg {...p}>{GLYPHS[name]}</Svg>;
}

// ---------- dice ----------

const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[7.5, 7.5], [16.5, 16.5]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7.5, 6.5], [16.5, 6.5], [7.5, 12], [16.5, 12], [7.5, 17.5], [16.5, 17.5]],
};

export function Die({ value, size = 30, red }: { value: number; size?: number; red?: boolean }) {
  return (
    <Svg size={size} title={`${value}`}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill={red ? '#c84a35' : '#f3e6c4'} stroke="#2b2112" strokeWidth="1.2" />
      {PIP_LAYOUT[value]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={red ? '#f3e6c4' : '#2b2112'} />)}
    </Svg>
  );
}

// ---------- terrain motifs for the board ----------
// Drawn in board units around the hex center (hex radius 40); the number token covers r≈15 in the middle.

const pine = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M0 -9 L6 1 H3 L7 7 H-7 L-3 1 H-6 Z" fill="#1d4d27" stroke="#123519" strokeWidth="0.8" strokeLinejoin="round" />
    <rect x="-1" y="7" width="2" height="3" fill="#5b3d1b" />
  </g>
);
const sheep = (x: number, y: number, flip = false) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -0.55 : 0.55},0.55)`}>
    <g fill="#f6f3ea" stroke="#9aa58a" strokeWidth="0.8">
      <circle cx="-3" cy="0" r="4" />
      <circle cx="2" cy="-1.5" r="4.2" />
      <circle cx="0" cy="2" r="4" />
    </g>
    <ellipse cx="7" cy="-1" rx="2.4" ry="3" fill="#3a3326" />
    <path d="M-3 5 V9 M3 5 V9" stroke="#3a3326" strokeWidth="1.6" />
  </g>
);
const sheaf = (x: number, y: number) => (
  <g transform={`translate(${x},${y})`} stroke="#9a7514" strokeWidth="1.1" strokeLinecap="round" fill="none">
    <path d="M0 8 V-6 M-3 8 L-1 -4 M3 8 L1 -4" />
    <path d="M0 -6 l-2 -2 M0 -6 l2 -2 M0 -2 l-2 -2 M0 -2 l2 -2" />
  </g>
);
const peak = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x},${y}) scale(${s})`} strokeLinejoin="round">
    <path d="M-11 7 L-2 -9 L3 -2 L6 -6 L13 7 Z" fill="#6c727b" stroke="#4b5057" strokeWidth="0.9" />
    <path d="M-5.2 -3.2 L-2 -9 L1.2 -4.2 L-0.6 -3 L-2.6 -4.6 Z" fill="#eef1f3" />
  </g>
);
const mound = (x: number, y: number, s = 1) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <path d="M-10 5 C-7 -5 7 -5 10 5 Z" fill="#a54f22" stroke="#7f3a17" strokeWidth="0.9" />
    <path d="M-4 1 h3 M1 -1 h3 M-1 3 h3" stroke="#e2a274" strokeWidth="1.1" strokeLinecap="round" />
  </g>
);
const wave = (x: number, y: number) => (
  <path
    d={`M${x - 7} ${y} q 3.5 -3 7 0 t 7 0`}
    fill="none"
    stroke="#7fc3dc"
    strokeOpacity="0.55"
    strokeWidth="1.3"
    strokeLinecap="round"
  />
);

export const TERRAIN_MOTIF: Record<Terrain, ReactNode> = {
  forest: (
    <>
      {pine(-16, -18, 0.95)}
      {pine(2, -22, 1.05)}
      {pine(19, -15, 0.9)}
      {pine(-23, 6, 0.85)}
      {pine(23, 8, 0.85)}
    </>
  ),
  pasture: (
    <>
      {sheep(-15, -18)}
      {sheep(16, -19, true)}
      {sheep(-21, 13, true)}
      <path d="M17 12 l1.5 -4 l1.5 4 M21 13 l1.2 -3.4 l1.2 3.4" stroke="#5f8f36" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),
  fields: (
    <>
      {sheaf(-18, -16)}
      {sheaf(-6, -22)}
      {sheaf(7, -22)}
      {sheaf(19, -16)}
      <path d="M-28 16 H-17 M17 16 H28 M-26 21 H-16 M16 21 H26" stroke="#b8901f" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  mountains: (
    <>
      {peak(-12, -18, 0.95)}
      {peak(13, -19, 0.85)}
      {peak(-22, 10, 0.6)}
      {peak(22, 11, 0.6)}
    </>
  ),
  hills: (
    <>
      {mound(-14, -17, 1)}
      {mound(10, -21, 1.15)}
      {mound(-22, 11, 0.75)}
      {mound(22, 12, 0.75)}
    </>
  ),
  sea: (
    <>
      {wave(-12, -14)}
      {wave(12, 4)}
      {wave(-8, 18)}
    </>
  ),
};
