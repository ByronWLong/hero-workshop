import { useState } from 'react';
import type { RaceDefinition } from '@hero-workshop/shared';
import { createNewCharacterSession, type ActorSession, type AppliedDocument } from '../sync/session';
import { EditorRoot } from './EditorRoot';
import { NewCharacterForm } from './NewCharacterForm';

interface NewCharacterFlowProps {
  onCreated(document: AppliedDocument): void;
  raceLibrary?: RaceDefinition[];
  onManageRaces?: () => void;
}

/** Character creation: pick a template, then build in the normal editor */
export function NewCharacterFlow({ onCreated, raceLibrary, onManageRaces }: NewCharacterFlowProps) {
  const [session, setSession] = useState<ActorSession>();

  if (!session) {
    return (
      <div className="hw-app">
        <main className="hw-main">
          <NewCharacterForm onStart={(options) => setSession(createNewCharacterSession(options))} />
        </main>
      </div>
    );
  }
  return (
    <EditorRoot
      session={session}
      onApplied={onCreated}
      raceLibrary={raceLibrary}
      onManageRaces={onManageRaces}
    />
  );
}
