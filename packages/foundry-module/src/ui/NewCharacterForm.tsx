import { useState } from 'react';
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@hero-workshop/shared';
import type { NewCharacterOptions } from '../sync/session';

interface NewCharacterFormProps {
  onStart(options: NewCharacterOptions): void;
}

/** First step of character creation: the choices that shape the blank HDC */
export function NewCharacterForm({ onStart }: NewCharacterFormProps) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<CharacterTemplateId>('heroic');
  const [actorType, setActorType] = useState<'pc' | 'npc'>('pc');
  const [basePoints, setBasePoints] = useState<number>(CHARACTER_TEMPLATES.heroic.basePoints);
  const [disadPoints, setDisadPoints] = useState<number>(CHARACTER_TEMPLATES.heroic.disadPoints);

  const chooseTemplate = (id: CharacterTemplateId) => {
    setTemplateId(id);
    setBasePoints(CHARACTER_TEMPLATES[id].basePoints);
    setDisadPoints(CHARACTER_TEMPLATES[id].disadPoints);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onStart({
      name: name.trim(),
      template: CHARACTER_TEMPLATES[templateId].template,
      actorType,
      basePoints,
      disadPoints,
    });
  };

  return (
    <form className="hw-panel hw-form" onSubmit={submit}>
      <h2>New character</h2>
      <p className="hw-muted">
        The actor is created when you apply your first changes, so nothing is added to the world until then.
      </p>

      <div className="form-group">
        <label className="form-label" htmlFor="hw-name">Name</label>
        <input id="hw-name" className="form-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="form-group">
        <span className="form-label">Template</span>
        <div className="hw-choice-row">
          {(Object.keys(CHARACTER_TEMPLATES) as CharacterTemplateId[]).map((id) => (
            <label key={id} className={`hw-choice ${templateId === id ? 'active' : ''}`}>
              <input type="radio" name="template" checked={templateId === id} onChange={() => chooseTemplate(id)} />
              <strong>{CHARACTER_TEMPLATES[id].label}</strong>
              <span className="hw-muted">
                {CHARACTER_TEMPLATES[id].basePoints} points, {CHARACTER_TEMPLATES[id].disadPoints} in complications
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="hw-form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="hw-base">Total points</label>
          <input id="hw-base" type="number" min={0} className="form-input" value={basePoints}
            onChange={(e) => setBasePoints(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="hw-disad">Complication points</label>
          <input id="hw-disad" type="number" min={0} className="form-input" value={disadPoints}
            onChange={(e) => setDisadPoints(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="hw-type">Actor type</label>
          <select id="hw-type" className="form-input" value={actorType} onChange={(e) => setActorType(e.target.value as 'pc' | 'npc')}>
            <option value="pc">Player character</option>
            <option value="npc">NPC</option>
          </select>
        </div>
      </div>

      <div className="hw-panel-actions">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Start building
        </button>
      </div>
    </form>
  );
}
