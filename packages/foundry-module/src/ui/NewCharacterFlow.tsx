import { useState } from 'react';
import { createNewCharacterSession, type ActorSession, type AppliedDocument } from '../sync/session';
import { EditorRoot } from './EditorRoot';
import { NewCharacterForm } from './NewCharacterForm';

interface NewCharacterFlowProps {
  onCreated(document: AppliedDocument): void;
}

/** Character creation: pick a template, then build in the normal editor */
export function NewCharacterFlow({ onCreated }: NewCharacterFlowProps) {
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
  return <EditorRoot session={session} onApplied={onCreated} />;
}
