import { Fragment, useMemo } from 'react';
import { RESOURCES, type Resource } from '../../shared/types.ts';
import { ResourceIcon } from './icons.tsx';

interface Who {
  name: string;
  color: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renders log text with player names in their colour and resource words as icons. */
export function RichText({ text, players }: { text: string; players: Who[] }) {
  const re = useMemo(() => {
    const names = players.map((p) => p.name).sort((a, b) => b.length - a.length).map(escape);
    return new RegExp(`(${[...names, `\\b(?:${RESOURCES.join('|')})\\b`].join('|')})`, 'g');
  }, [players]);
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        if ((RESOURCES as readonly string[]).includes(part))
          return (
            <span key={i} className={`ri ${part}`} title={part}>
              <ResourceIcon res={part as Resource} size="100%" />
            </span>
          );
        const who = players.find((p) => p.name === part);
        if (who)
          return (
            <b key={i} className="who" style={{ color: who.color }}>
              {part}
            </b>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
