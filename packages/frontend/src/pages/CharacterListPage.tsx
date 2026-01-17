import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterList, useCreateCharacter } from '../hooks/useCharacter';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Modal } from '../components/Modal';
import type { Character } from '@hero-workshop/shared';

// Default characteristics for a new 6th edition character
const DEFAULT_CHARACTERISTICS = [
  { id: 'STR', name: 'Strength', alias: 'STR', abbreviation: 'STR', position: 0, levels: 0, baseCost: 0, type: 'STR' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'DEX', name: 'Dexterity', alias: 'DEX', abbreviation: 'DEX', position: 1, levels: 0, baseCost: 0, type: 'DEX' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'CON', name: 'Constitution', alias: 'CON', abbreviation: 'CON', position: 2, levels: 0, baseCost: 0, type: 'CON' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'INT', name: 'Intelligence', alias: 'INT', abbreviation: 'INT', position: 3, levels: 0, baseCost: 0, type: 'INT' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'EGO', name: 'Ego', alias: 'EGO', abbreviation: 'EGO', position: 4, levels: 0, baseCost: 0, type: 'EGO' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'PRE', name: 'Presence', alias: 'PRE', abbreviation: 'PRE', position: 5, levels: 0, baseCost: 0, type: 'PRE' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'OCV', name: 'Offensive Combat Value', alias: 'OCV', abbreviation: 'OCV', position: 6, levels: 0, baseCost: 0, type: 'OCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'DCV', name: 'Defensive Combat Value', alias: 'DCV', abbreviation: 'DCV', position: 7, levels: 0, baseCost: 0, type: 'DCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'OMCV', name: 'Offensive Mental Combat Value', alias: 'OMCV', abbreviation: 'OMCV', position: 8, levels: 0, baseCost: 0, type: 'OMCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'DMCV', name: 'Defensive Mental Combat Value', alias: 'DMCV', abbreviation: 'DMCV', position: 9, levels: 0, baseCost: 0, type: 'DMCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'SPD', name: 'Speed', alias: 'SPD', abbreviation: 'SPD', position: 10, levels: 0, baseCost: 0, type: 'SPD' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'PD', name: 'Physical Defense', alias: 'PD', abbreviation: 'PD', position: 11, levels: 0, baseCost: 0, type: 'PD' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'ED', name: 'Energy Defense', alias: 'ED', abbreviation: 'ED', position: 12, levels: 0, baseCost: 0, type: 'ED' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'REC', name: 'Recovery', alias: 'REC', abbreviation: 'REC', position: 13, levels: 0, baseCost: 0, type: 'REC' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
  { id: 'END', name: 'Endurance', alias: 'END', abbreviation: 'END', position: 14, levels: 0, baseCost: 0, type: 'END' as const, baseValue: 20, totalValue: 20, affectsPrimary: true, affectsTotal: true },
  { id: 'BODY', name: 'Body', alias: 'BODY', abbreviation: 'BODY', position: 15, levels: 0, baseCost: 0, type: 'BODY' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'STUN', name: 'Stun', alias: 'STUN', abbreviation: 'STUN', position: 16, levels: 0, baseCost: 0, type: 'STUN' as const, baseValue: 20, totalValue: 20, affectsPrimary: true, affectsTotal: true },
  { id: 'RUNNING', name: 'Running', alias: 'Running', abbreviation: 'RUN', position: 17, levels: 0, baseCost: 0, type: 'RUNNING' as const, baseValue: 12, totalValue: 12, affectsPrimary: true, affectsTotal: true },
  { id: 'SWIMMING', name: 'Swimming', alias: 'Swimming', abbreviation: 'SWIM', position: 18, levels: 0, baseCost: 0, type: 'SWIMMING' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
  { id: 'LEAPING', name: 'Leaping', alias: 'Leaping', abbreviation: 'LEAP', position: 19, levels: 0, baseCost: 0, type: 'LEAPING' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
];

const TEMPLATES = [
  { id: 'builtIn.Superheroic6E.hdt', name: 'Superheroic (6th Edition)', basePoints: 400, disadPoints: 75 },
  { id: 'builtIn.Heroic6E.hdt', name: 'Heroic (6th Edition)', basePoints: 175, disadPoints: 50 },
  { id: 'builtIn.Follower6E.hdt', name: 'Follower (6th Edition)', basePoints: 100, disadPoints: 30 },
  { id: 'builtIn.Normal.hdt', name: 'Normal', basePoints: 50, disadPoints: 25 },
];

function createDefaultCharacter(name: string, playerName: string, templateId: string): Character {
  const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[1];
  
  return {
    version: '6.0',
    basicConfiguration: {
      basePoints: template.basePoints,
      disadPoints: template.disadPoints,
      experience: 0,
    },
    characterInfo: {
      characterName: name,
      playerName: playerName,
    },
    characteristics: DEFAULT_CHARACTERISTICS,
    skills: [],
    perks: [],
    talents: [],
    martialArts: [],
    powers: [],
    disadvantages: [],
    equipment: [],
  };
}

export function CharacterListPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useCharacterList();
  const createCharacter = useCreateCharacter();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('builtIn.Heroic6E.hdt');
  const [createError, setCreateError] = useState<string | null>(null);

  const handleNewCharacter = () => {
    setCharacterName('');
    setPlayerName('');
    setSelectedTemplate('builtIn.Heroic6E.hdt');
    setCreateError(null);
    setIsModalOpen(true);
  };

  const handleCreateCharacter = async () => {
    if (!characterName.trim()) {
      setCreateError('Character name is required');
      return;
    }

    try {
      setCreateError(null);
      const character = createDefaultCharacter(characterName.trim(), playerName.trim(), selectedTemplate);
      const result = await createCharacter.mutateAsync({
        character,
        fileName: characterName.trim(),
      });
      
      setIsModalOpen(false);
      if (result?.fileId) {
        navigate(`/characters/${result.fileId}`);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create character');
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
        <p>Loading characters from Google Drive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Error Loading Characters</div>
        <p>{error instanceof Error ? error.message : 'An error occurred'}</p>
      </div>
    );
  }

  const files = data?.files ?? [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Characters</h1>
        <button className="btn btn-primary" onClick={handleNewCharacter}>
          + New Character
        </button>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🦸</div>
          <div className="empty-state-title">No Characters Yet</div>
          <p>Create your first character to get started!</p>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem' }}
            onClick={handleNewCharacter}
          >
            Create Character
          </button>
        </div>
      ) : (
        <div className="character-grid">
          {files.map((file) => (
            <div
              key={file.id}
              className="character-card"
              onClick={() => navigate(`/characters/${file.id}`)}
            >
              <div className="character-name">
                {file.name.replace('.hdc', '')}
              </div>
              <div className="character-player">
                Last modified: {new Date(file.modifiedTime).toLocaleDateString()}
              </div>
              <div className="character-stats">
                {file.size && (
                  <span className="character-stat">
                    📄 {Math.round(parseInt(file.size) / 1024)} KB
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Character"
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setIsModalOpen(false)}
              disabled={createCharacter.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateCharacter}
              disabled={createCharacter.isPending || !characterName.trim()}
            >
              {createCharacter.isPending ? 'Creating...' : 'Create Character'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {createError && (
            <div className="error-message" style={{ color: 'var(--color-error)', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
              {createError}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="characterName" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Character Name <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="characterName"
              type="text"
              className="input"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Enter character name"
              autoFocus
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="playerName" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Player Name
            </label>
            <input
              id="playerName"
              type="text"
              className="input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter player name (optional)"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="template" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Character Template
            </label>
            <select
              id="template"
              className="input"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            >
              {TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.basePoints} + {template.disadPoints} pts)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
