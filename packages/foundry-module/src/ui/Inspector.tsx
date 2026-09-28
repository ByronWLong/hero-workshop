/**
 * Read-only view of an actor's HDC: summary, Foundry compatibility check and the raw XML.
 */

import { useMemo, useState } from 'react';
import { HdcDocument, parseHdcDocument, validateForFoundry } from '@hero-workshop/shared';
import { EffectiveStatsCard } from '@frontend/components/EffectiveStatsCard';

type View = 'summary' | 'check' | 'xml';

interface InspectorProps {
  name: string;
  xml: string;
  onDownload(): void;
}

export function Inspector({ name, xml, onDownload }: InspectorProps) {
  const [view, setView] = useState<View>('summary');
  const { character, issues } = useMemo(() => {
    const doc = HdcDocument.parse(xml);
    const issues = validateForFoundry(doc);
    doc.ensureIds();
    return { character: parseHdcDocument(doc), issues };
  }, [xml]);

  const counts: [string, number][] = [
    ['Skills', character.skills.length],
    ['Perks', character.perks.length],
    ['Talents', character.talents.length],
    ['Martial Arts', character.martialArts.length],
    ['Powers', character.powers.length],
    ['Complications', character.disadvantages.length],
    ['Equipment', character.equipment?.length ?? 0],
  ];

  return (
    <div className="hw-app">
      <header className="hw-toolbar">
        <div className="hw-title">{name}</div>
        <div className="hw-actions">
          <div className="tab-list hw-compact-tabs">
            {(['summary', 'check', 'xml'] as View[]).map((v) => (
              <button key={v} className={`tab-button ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {v === 'summary' ? 'Summary' : v === 'check' ? `Foundry check (${issues.length})` : 'XML'}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={onDownload}>
            Download .hdc
          </button>
        </div>
      </header>

      <main className="hw-main">
        {view === 'summary' && (
          <div className="hw-inspector-summary">
            <section className="hw-panel">
              <h2>{character.characterInfo.characterName || name}</h2>
              <p className="hw-muted">
                {character.basicConfiguration.basePoints} base points,{' '}
                {character.basicConfiguration.disadPoints} complication points,{' '}
                {character.basicConfiguration.experience} experience
              </p>
              <dl className="hw-counts">
                {counts.map(([label, count]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <EffectiveStatsCard character={character} />
          </div>
        )}

        {view === 'check' && (
          <section className="hw-panel">
            <h2>Foundry compatibility</h2>
            {issues.length === 0 ? (
              <p className="hw-muted">No problems found.</p>
            ) : (
              <ul className="hw-list">
                {issues.map((issue, i) => (
                  <li key={i} className={issue.severity === 'error' ? 'hw-error' : undefined}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view === 'xml' && <pre className="hw-xml">{xml}</pre>}
      </main>
    </div>
  );
}
