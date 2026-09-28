/**
 * GM editor for the world's race library: each race's listed characteristics, from which
 * characters' maxima are derived (+10, +1 SPD, +2 combat values; mixed races averaged).
 */

import { useRef, useState } from 'react';
import {
  MAXIMA_CHARACTERISTICS,
  raceMaxima,
  type CharacteristicType,
  type RaceDefinition,
} from '@hero-workshop/shared';
import { newRaceId, raceFromActor, raceFromRulesFile } from '../races/library';

interface RaceLibraryManagerProps {
  races: RaceDefinition[];
  editable: boolean;
  actors: FoundryActor[];
  onSave(races: RaceDefinition[]): Promise<void>;
}

export function RaceLibraryManager({ races, editable, actors, onSave }: RaceLibraryManagerProps) {
  const [draft, setDraft] = useState(races);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [actorId, setActorId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(races);

  const update = (id: string, change: Partial<RaceDefinition>) =>
    setDraft((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const setStat = (race: RaceDefinition, type: CharacteristicType, raw: string) => {
    const stats = { ...race.stats };
    const value = parseInt(raw, 10);
    if (raw.trim() === '' || !Number.isFinite(value)) delete stats[type];
    else stats[type] = value;
    update(race.id, { stats });
  };

  const add = (race: RaceDefinition) => {
    setError(undefined);
    setDraft((list) => [...list, race]);
  };

  const importFile = async (file: File) => {
    try {
      add(raceFromRulesFile(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.filter((r) => r.name.trim()));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hw-app">
      <header className="hw-toolbar">
        <div className="hw-title">Race library</div>
        {editable && (
          <div className="hw-actions">
            <button className="btn btn-secondary" onClick={() => add({ id: newRaceId(), name: 'New race', stats: {} })}>
              Add race
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </header>

      <main className="hw-main">
        <p className="hw-muted" style={{ marginBottom: '1rem' }}>
          Enter each race&apos;s listed characteristics. A character&apos;s maxima are these +10 (SPD +1,
          OCV/DCV/OMCV/DMCV +2), averaged across the character&apos;s races and rounded up. Leave a value
          blank if the race doesn&apos;t list it.
        </p>

        {editable && (
          <div className="hw-import-row">
            <select className="form-input" value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">Import a creature actor…</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={!actorId}
              onClick={() => {
                const actor = actors.find((a) => a.id === actorId);
                if (actor) add(raceFromActor(actor));
                setActorId('');
              }}
            >
              Import actor
            </button>
            <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
              Import Hero Designer rules file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".hdc,.hdr,.xml"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
        {error && <div className="hw-banner hw-banner-error">{error}</div>}

        {draft.length === 0 ? (
          <div className="hw-empty">No races yet.</div>
        ) : (
          <div className="hw-race-table-wrap">
            <table className="hw-race-table">
              <thead>
                <tr>
                  <th>Race</th>
                  {MAXIMA_CHARACTERISTICS.map((type) => (
                    <th key={type}>{type}</th>
                  ))}
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {[...draft]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((race) => {
                    const maxima = raceMaxima(race);
                    return (
                      <tr key={race.id}>
                        <td>
                          <input
                            className="form-input"
                            value={race.name}
                            disabled={!editable}
                            onChange={(e) => update(race.id, { name: e.target.value })}
                          />
                        </td>
                        {MAXIMA_CHARACTERISTICS.map((type) => (
                          <td key={type} title={maxima[type] !== undefined ? `Maximum ${maxima[type]}` : 'Not listed'}>
                            <input
                              type="number"
                              className="form-input"
                              value={race.stats[type] ?? ''}
                              disabled={!editable}
                              onChange={(e) => setStat(race, type, e.target.value)}
                            />
                          </td>
                        ))}
                        {editable && (
                          <td>
                            <button
                              className="btn-icon-small"
                              title="Delete race"
                              onClick={() => setDraft((list) => list.filter((r) => r.id !== race.id))}
                            >
                              🗑️
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
