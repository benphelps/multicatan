import { useEffect, useMemo, useState } from 'react';
import { Die } from '../icons.tsx';

// Cube faces: the value on each face and where it sits; SHOW is the rotation that brings it to the front.
const FACES: { value: number; face: string }[] = [
  { value: 1, face: 'rotateY(0deg)' },
  { value: 6, face: 'rotateY(180deg)' },
  { value: 3, face: 'rotateY(90deg)' },
  { value: 4, face: 'rotateY(-90deg)' },
  { value: 2, face: 'rotateX(90deg)' },
  { value: 5, face: 'rotateX(-90deg)' },
];
const SHOW: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  3: [0, -90],
  4: [0, 90],
  2: [-90, 0],
  5: [90, 0],
};

export const DICE_SETTLE_MS = 950;
const DIE = 52;

/**
 * The last roll, resting in the bottom-left corner of the board. When `animate` is set (a fresh
 * roll), the dice are thrown across the board and tumble into the corner.
 */
export function DiceRoll({ dice, animate }: { dice: [number, number]; animate: boolean }) {
  const [settled, setSettled] = useState(!animate);
  const [fresh, setFresh] = useState(animate);
  useEffect(() => {
    if (!animate) return;
    const a = setTimeout(() => setSettled(true), DICE_SETTLE_MS);
    const b = setTimeout(() => setFresh(false), DICE_SETTLE_MS + 2800);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [animate]);
  const spins = useMemo(
    () => dice.map(() => ({ rx0: Math.round(Math.random() * 360 - 180), ry0: Math.round(Math.random() * 360 - 180), tilt: Math.round(Math.random() * 14 - 7) })),
    [dice],
  );
  const sum = dice[0] + dice[1];

  return (
    <div className={`dice-corner ${animate ? 'thrown' : ''} ${settled ? 'settled' : ''}`} aria-live="polite" aria-label={`Last roll: ${dice[0]} and ${dice[1]}, total ${sum}`}>
      <div className="dice-pair">
        {dice.map((v, i) => {
          const [rx, ry] = SHOW[v];
          const s = spins[i];
          return (
            <div key={i} className={`die-throw d${i}`} style={{ ['--tilt' as string]: `${s.tilt}deg` }}>
              <div
                className="die3d"
                style={
                  {
                    '--rx0': `${s.rx0}deg`,
                    '--ry0': `${s.ry0}deg`,
                    '--rx1': `${rx + 720}deg`,
                    '--ry1': `${ry + 360}deg`,
                  } as React.CSSProperties
                }
              >
                {FACES.map((f) => (
                  <div key={f.value} className="die-face" style={{ transform: `${f.face} translateZ(${DIE / 2}px)` }}>
                    <Die value={f.value} size={DIE} red={i === 1} />
                  </div>
                ))}
              </div>
              <div className="die-shadow" />
            </div>
          );
        })}
      </div>
      <div className={`dice-sum ${sum === 7 ? 'seven' : ''}`}>
        <b>{sum}</b>
        {sum === 7 && fresh && <span>Robber!</span>}
      </div>
    </div>
  );
}
