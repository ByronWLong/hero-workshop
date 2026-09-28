/**
 * Editing flow for one actor:
 *   1. drift  - review edits made on the hero6e sheet that aren't in the stored HDC
 *   2. edit   - the Hero Workshop editor, working on the (drift-merged) HDC
 *   3. review - what will be written, plus Foundry compatibility findings
 *   4. apply  - re-import through hero6e
 */

import { useMemo, useState } from 'react';
import {
  HdcDocument,
  parseHdcFile,
  updateHdc,
  type Character,
  type HdcWriteReport,
} from '@hero-workshop/shared';
import { CharacterEditor } from '@frontend/components/CharacterEditor';
import { applyDrift, type DriftChange } from '../sync/drift';
import type { ActorSession } from '../sync/session';
import { DriftReview } from './DriftReview';
import { ReviewPanel } from './ReviewPanel';

type Stage =
  | { kind: 'drift'; doc: HdcDocument; changes: DriftChange[] }
  | { kind: 'edit' }
  | { kind: 'review'; xml: string; report: HdcWriteReport }
  | { kind: 'applying' };

interface EditorRootProps {
  session: ActorSession;
  onApplied(): void;
}

export function EditorRoot({ session, onApplied }: EditorRootProps) {
  // Base HDC for this editing session: the stored HDC plus any drift the user accepted
  const [baseXml, setBaseXml] = useState(session.hdcXml);
  const initial = useMemo(() => {
    const doc = HdcDocument.parse(session.hdcXml);
    const changes = session.detectDrift(doc);
    return { doc, changes };
  }, [session]);

  const [stage, setStage] = useState<Stage>(() =>
    initial.changes.length ? { kind: 'drift', ...initial } : { kind: 'edit' },
  );
  const [original, setOriginal] = useState<Character>(() => parseHdcFile(session.hdcXml));
  const [character, setCharacter] = useState<Character>(original);
  const [error, setError] = useState<string>();
  const [keptFromFoundry, setKeptFromFoundry] = useState(0);

  const dirty = character !== original || baseXml !== session.hdcXml;

  const acceptDrift = (selected: DriftChange[]) => {
    if (stage.kind !== 'drift') return;
    if (selected.length) {
      applyDrift(stage.doc, selected);
      const xml = stage.doc.toString();
      const parsed = parseHdcFile(xml);
      setBaseXml(xml);
      setOriginal(parsed);
      setCharacter(parsed);
    }
    setKeptFromFoundry(selected.length);
    setStage({ kind: 'edit' });
  };

  const review = () => {
    try {
      const { xml, report } = updateHdc(baseXml, character);
      setStage({ kind: 'review', xml, report });
      setError(undefined);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const apply = async (xml: string) => {
    setStage({ kind: 'applying' });
    try {
      const name = character.characterInfo.characterName;
      await session.apply(xml, {
        characterName: name !== original.characterInfo.characterName ? name : undefined,
      });
      onApplied();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: 'edit' });
    }
  };

  const currentXml = () => (dirty ? updateHdc(baseXml, character).xml : baseXml);

  return (
    <div className="hw-app">
      <header className="hw-toolbar">
        <div className="hw-title">
          {character.characterInfo.characterName || session.actorName}
          {dirty && <span className="hw-dirty" title="Unsaved changes">•</span>}
        </div>
        <div className="hw-actions">
          <button
            className="btn btn-secondary"
            onClick={() => session.download(currentXml(), character.characterInfo.characterName || session.actorName)}
          >
            Download .hdc
          </button>
          {stage.kind === 'edit' && (
            <button className="btn btn-primary" onClick={review} disabled={!dirty}>
              Review &amp; Apply
            </button>
          )}
        </div>
      </header>

      {error && <div className="hw-banner hw-banner-error">{error}</div>}

      <main className="hw-main">
        {stage.kind === 'drift' && (
          <DriftReview changes={stage.changes} onContinue={acceptDrift} />
        )}
        {stage.kind === 'edit' && <CharacterEditor character={character} onUpdate={setCharacter} />}
        {stage.kind === 'review' && (
          <ReviewPanel
            report={stage.report}
            keptFromFoundry={keptFromFoundry}
            onBack={() => setStage({ kind: 'edit' })}
            onApply={() => apply(stage.xml)}
          />
        )}
        {stage.kind === 'applying' && <div className="hw-empty">Updating {session.actorName}…</div>}
      </main>
    </div>
  );
}
