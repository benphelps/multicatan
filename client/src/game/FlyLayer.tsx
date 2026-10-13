import { useSyncExternalStore } from 'react';
import { GlyphName, Icon, ResourceIcon } from '../icons.tsx';
import { flightStore } from './anim.ts';

const DEV_GLYPH: Record<string, GlyphName> = { knight: 'knight', roadBuilding: 'roadBuilding', victoryPoint: 'victoryPoint', back: 'card' };

export function FlyLayer() {
  const flights = useSyncExternalStore(flightStore.subscribe, flightStore.get);
  return (
    <div className="fly-layer" aria-hidden>
      {flights.map((f) => (
        <div
          key={f.id}
          className={`flight ${f.fade ? 'fade' : ''}`}
          style={
            {
              left: f.from.x,
              top: f.from.y,
              '--dx': `${f.to.x - f.from.x}px`,
              '--dy': `${f.to.y - f.from.y}px`,
              '--dur': `${f.dur}ms`,
              '--delay': `${f.delay}ms`,
            } as React.CSSProperties
          }
        >
          <div className="flight-y">
            {'res' in f.what ? (
              <span className={`fly-token ${f.what.res}`}>
                <ResourceIcon res={f.what.res} size="100%" />
              </span>
            ) : (
              <span className="fly-card">
                <Icon name={DEV_GLYPH[f.what.dev]} size="100%" className={`dv ${f.what.dev}`} />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
