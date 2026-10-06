import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Character } from '@hero-workshop/shared';
import { useCharacter, useSaveCharacter } from '../hooks/useCharacter';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { CharacterEditor } from '../components/CharacterEditor';

export function CharacterEditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const [localCharacter, setLocalCharacter] = useState<Character | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: character, isLoading, error } = useCharacter(fileId);
  const saveCharacter = useSaveCharacter();

  // Use local state if we have changes, otherwise use fetched data
  const displayCharacter = localCharacter ?? character;

  const handleUpdate = useCallback((updated: Character) => {
    setLocalCharacter(updated);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (!fileId || !localCharacter) return;

    try {
      await saveCharacter.mutateAsync({ fileId, character: localCharacter });
      setHasChanges(false);
    } catch (err) {
      console.error('Save failed:', err);
      // TODO: Show error toast
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
        <p>Loading character...</p>
      </div>
    );
  }

  if (error || !displayCharacter) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Error Loading Character</div>
        <p>{error instanceof Error ? error.message : 'Character not found'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/characters')}>
          Back to Characters
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {displayCharacter.characterInfo.characterName}
            {hasChanges && <span style={{ color: 'var(--warning)', marginLeft: '0.5rem' }}>•</span>}
          </h1>
          {displayCharacter.characterInfo.playerName && (
            <p style={{ color: 'var(--text-secondary)' }}>
              Player: {displayCharacter.characterInfo.playerName}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasChanges && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saveCharacter.isPending}
            >
              {saveCharacter.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <CharacterEditor character={displayCharacter} onUpdate={handleUpdate} />
    </div>
  );
}
