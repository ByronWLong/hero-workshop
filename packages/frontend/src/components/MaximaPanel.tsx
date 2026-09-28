/**
 * Per-character characteristic maxima: pick the character's original race(s) to derive
 * them (listed stats +10, +1 SPD, +2 combat values, mixed races averaged and rounded up),
 * then adjust individual values. Stored in the character's embedded Hero Designer RULES.
 */

import { useState } from 'react';
import {
  MAXIMA_CHARACTERISTICS,
  characteristicCost,
  combinedRaceMaxima,
  type Character,
  type CharacteristicMaxima,
  type RaceDefinition,
  type Rules,
} from '@hero-workshop/shared';

interface MaximaPanelProps {
  character: Character;
  onUpdate: (character: Character) => void;
  /** Races available to pick from (e.g. the Foundry world's race library) */
  raceLibrary?: RaceDefinition[];
  /** Opens the host's race library manager, if it has one */
  onManageRaces?: () => void;
}

/** Applies new maxima/races and re-costs characteristics, whose price depends on them */
export function withMaxima(character: Character, maxima: CharacteristicMaxima, races?: string[]): Character {
  const rules: Rules = {
    ...(character.rules ?? ({ name: 'Campaign' } as Rules)),
    characteristicMaxima: maxima,
    races: races ?? character.rules?.races,
  };
  return {
    ...character,
    rules,
    characteristics: character.characteristics.map((c) => {
      const cost = characteristicCost(c.type, c.levels, maxima[c.type]);
      return cost === c.realCost ? c : { ...c, baseCost: cost, realCost: cost };
    }),
  };
}

export function MaximaPanel({ character, onUpdate, raceLibrary = [], onManageRaces }: MaximaPanelProps) {
  const maxima = character.rules?.characteristicMaxima ?? {};
  const races = character.rules?.races ?? [];
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>(races);
  const [typedRace, setTypedRace] = useState('');

  const libraryByName = new Map(raceLibrary.map((r) => [r.name.toLowerCase(), r]));
  const unknownRaces = races.filter((r) => !libraryByName.has(r.toLowerCase()));

  const setMaximum = (type: (typeof MAXIMA_CHARACTERISTICS)[number], raw: string) => {
    const next = { ...maxima };
    const value = parseInt(raw, 10);
    if (raw.trim() === '' || !Number.isFinite(value)) delete next[type];
    else next[type] = value;
    onUpdate(withMaxima(character, next));
  };

  const applyRaces = () => {
    const chosen = selected
      .map((name) => libraryByName.get(name.toLowerCase()))
      .filter((r): r is RaceDefinition => !!r);
    // Only characteristics the chosen races define are replaced; movement keeps its values
    const next = chosen.length ? { ...maxima, ...combinedRaceMaxima(chosen) } : maxima;
    onUpdate(withMaxima(character, next, selected));
    setPicking(false);
  };

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const addTypedRace = () => {
    const name = typedRace.trim();
    if (name && !selected.includes(name)) setSelected([...selected, name]);
    setTypedRace('');
  };

  return (
    <section className="card maxima-panel" style={{ marginBottom: '2rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Characteristic Maxima</h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {races.length ? (
              <>Races: {races.join(' / ')}</>
            ) : (
              'No races chosen. Levels above a maximum cost double.'
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onManageRaces && (
            <button className="btn btn-secondary" onClick={onManageRaces}>
              Race library
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSelected(races);
              setPicking(!picking);
            }}
          >
            {picking ? 'Cancel' : 'Choose races'}
          </button>
        </div>
      </div>

      {picking && (
        <div className="maxima-race-picker" style={{ marginTop: '1rem' }}>
          {raceLibrary.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[...raceLibrary]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((race) => (
                  <label key={race.id} className={`race-chip ${selected.includes(race.name) ? 'active' : ''}`}>
                    <input type="checkbox" checked={selected.includes(race.name)} onChange={() => toggle(race.name)} />
                    {race.name}
                  </label>
                ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              No race library is available here, so maxima won&apos;t be calculated. You can still record
              the character&apos;s races and enter maxima below.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {selected
              .filter((name) => !libraryByName.has(name.toLowerCase()))
              .map((name) => (
                <span key={name} className="race-chip active">
                  {name}
                  <button className="btn-icon-small" onClick={() => toggle(name)} title="Remove">
                    ✕
                  </button>
                </span>
              ))}
            <input
              className="form-input"
              style={{ maxWidth: '220px' }}
              placeholder="Other race name"
              value={typedRace}
              onChange={(e) => setTypedRace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTypedRace();
                }
              }}
            />
            <button className="btn btn-secondary" onClick={addTypedRace} disabled={!typedRace.trim()}>
              Add
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button className="btn btn-primary" onClick={applyRaces}>
              Apply {selected.length ? `${selected.length} ${selected.length === 1 ? 'race' : 'races'}` : 'no races'}
            </button>
          </div>
        </div>
      )}

      {unknownRaces.length > 0 && raceLibrary.length > 0 && !picking && (
        <div style={{ fontSize: '0.8rem', color: 'var(--warning)', marginTop: '0.5rem' }}>
          Not in the race library: {unknownRaces.join(', ')}
        </div>
      )}

      <div className="maxima-grid">
        {MAXIMA_CHARACTERISTICS.map((type) => (
          <label key={type} className="maxima-cell">
            <span>{type}</span>
            <input
              type="number"
              className="form-input"
              value={maxima[type] ?? ''}
              placeholder="—"
              title={maxima[type] === undefined ? 'No limit' : `Maximum ${type}`}
              onChange={(e) => setMaximum(type, e.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
