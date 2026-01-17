import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Character } from '@hero-workshop/shared';
import { useCharacter, useSaveCharacter } from '../hooks/useCharacter';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { InfoTab } from '../components/InfoTab';
import { CharacteristicsTab } from '../components/CharacteristicsTab';
import { SkillsTab } from '../components/SkillsTab';
import { PerksTab } from '../components/PerksTab';
import { TalentsTab } from '../components/TalentsTab';
import { PowersTab } from '../components/PowersTab';
import { DisadvantagesTab } from '../components/DisadvantagesTab';
import { EquipmentTab } from '../components/EquipmentTab';
import { MartialArtsTab } from '../components/MartialArtsTab';
import { CharacterSummaryCard } from '../components/CharacterSummaryCard';
import { EffectiveStatsCard } from '../components/EffectiveStatsCard';

type TabId = 'info' | 'characteristics' | 'skills' | 'perks' | 'talents' | 'martialarts' | 'powers' | 'disadvantages' | 'equipment';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'info', label: 'Info', icon: '📋' },
  { id: 'characteristics', label: 'Characteristics', icon: '💪' },
  { id: 'skills', label: 'Skills', icon: '📚' },
  { id: 'perks', label: 'Perks', icon: '🎖️' },
  { id: 'talents', label: 'Talents', icon: '✨' },
  { id: 'martialarts', label: 'Martial Arts', icon: '🥋' },
  { id: 'powers', label: 'Powers', icon: '⚡' },
  { id: 'disadvantages', label: 'Complications', icon: '⚠️' },
  { id: 'equipment', label: 'Equipment', icon: '🎒' },
];

export function CharacterEditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('info');
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
          <button 
            className="btn btn-secondary" 
            onClick={() => navigate('/characters')}
            style={{ marginBottom: '0.5rem' }}
          >
            ← Back
          </button>
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

      <div className="editor-layout">
        <aside className="editor-sidebar">
          <CharacterSummaryCard character={displayCharacter} onUpdate={handleUpdate} />
          <EffectiveStatsCard character={displayCharacter} />
        </aside>

        <section className="editor-content">
          <div className="tab-list">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'info' && (
              <InfoTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'characteristics' && (
              <CharacteristicsTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'skills' && (
              <SkillsTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'perks' && (
              <PerksTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'talents' && (
              <TalentsTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'powers' && (
              <PowersTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'disadvantages' && (
              <DisadvantagesTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'martialarts' && (
              <MartialArtsTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
            {activeTab === 'equipment' && (
              <EquipmentTab character={displayCharacter} onUpdate={handleUpdate} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
