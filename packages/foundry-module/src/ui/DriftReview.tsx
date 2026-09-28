import { useMemo, useState } from 'react';
import type { DriftChange } from '../sync/drift';

interface DriftReviewProps {
  changes: DriftChange[];
  onContinue(selected: DriftChange[]): void;
}

const KIND_LABEL: Record<DriftChange['kind'], string> = {
  modified: 'Changed',
  added: 'Added',
  removed: 'Removed',
};

/** Lists Foundry-side edits so the user can pull them into the HDC before editing */
export function DriftReview({ changes, onContinue }: DriftReviewProps) {
  const [selected, setSelected] = useState(
    () => new Set(changes.filter((c) => c.recommended).map((c) => c.key)),
  );

  const groups = useMemo(() => {
    const byItem = new Map<string, DriftChange[]>();
    for (const change of changes) {
      const list = byItem.get(change.itemName) ?? [];
      list.push(change);
      byItem.set(change.itemName, list);
    }
    return [...byItem.entries()];
  }, [changes]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="hw-panel">
      <h2>Changes made in Foundry</h2>
      <p className="hw-muted">
        This actor was edited on its Foundry sheet after its Hero Designer data was last saved.
        Selected changes will be copied into the character before you edit it, so saving from
        Hero Workshop won&apos;t undo them.
      </p>

      <div className="hw-drift-list">
        {groups.map(([itemName, itemChanges]) => (
          <div key={itemName} className="hw-drift-item">
            <div className="hw-drift-name">{itemName}</div>
            {itemChanges.map((change) => (
              <label key={change.key} className="hw-drift-change">
                <input
                  type="checkbox"
                  checked={selected.has(change.key)}
                  onChange={() => toggle(change.key)}
                />
                <span className={`hw-kind hw-kind-${change.kind}`}>{KIND_LABEL[change.kind]}</span>
                <span>{change.summary}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="hw-panel-actions">
        <button className="btn btn-secondary" onClick={() => onContinue([])}>
          Discard Foundry changes
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onContinue(changes.filter((c) => selected.has(c.key)))}
        >
          Keep {selected.size} selected {selected.size === 1 ? 'change' : 'changes'}
        </button>
      </div>
    </section>
  );
}
