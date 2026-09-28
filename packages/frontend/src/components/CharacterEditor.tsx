/**
 * The full character editor (summary sidebar + section tabs), independent of where the
 * character came from. Used by the web app's editor page and the Foundry VTT module.
 */

import { useState } from 'react';
import type { Character } from '@hero-workshop/shared';
import { InfoTab } from './InfoTab';
import { CharacteristicsTab } from './CharacteristicsTab';
import { SkillsTab } from './SkillsTab';
import { PerksTab } from './PerksTab';
import { TalentsTab } from './TalentsTab';
import { PowersTab } from './PowersTab';
import { DisadvantagesTab } from './DisadvantagesTab';
import { EquipmentTab } from './EquipmentTab';
import { MartialArtsTab } from './MartialArtsTab';
import { CharacterSummaryCard } from './CharacterSummaryCard';
import { EffectiveStatsCard } from './EffectiveStatsCard';

export type TabId =
  | 'info'
  | 'characteristics'
  | 'skills'
  | 'perks'
  | 'talents'
  | 'martialarts'
  | 'powers'
  | 'disadvantages'
  | 'equipment';

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

interface CharacterEditorProps {
  character: Character;
  onUpdate: (character: Character) => void;
  initialTab?: TabId;
  /** Restricts the editor to these sections (e.g. when editing a single item) */
  visibleTabs?: TabId[];
  /** Hides the point summary and effective stats sidebar */
  hideSidebar?: boolean;
}

export function CharacterEditor({
  character,
  onUpdate,
  initialTab = 'info',
  visibleTabs,
  hideSidebar = false,
}: CharacterEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const shownTabs = visibleTabs ? tabs.filter((tab) => visibleTabs.includes(tab.id)) : tabs;

  return (
    <div className={hideSidebar ? 'editor-layout editor-layout-single' : 'editor-layout'}>
      {!hideSidebar && (
        <aside className="editor-sidebar">
          <CharacterSummaryCard character={character} onUpdate={onUpdate} />
          <EffectiveStatsCard character={character} />
        </aside>
      )}

      <section className="editor-content">
        <div className="tab-list">
          {shownTabs.map((tab) => (
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
          {activeTab === 'info' && <InfoTab character={character} onUpdate={onUpdate} />}
          {activeTab === 'characteristics' && (
            <CharacteristicsTab character={character} onUpdate={onUpdate} />
          )}
          {activeTab === 'skills' && <SkillsTab character={character} onUpdate={onUpdate} />}
          {activeTab === 'perks' && <PerksTab character={character} onUpdate={onUpdate} />}
          {activeTab === 'talents' && <TalentsTab character={character} onUpdate={onUpdate} />}
          {activeTab === 'powers' && <PowersTab character={character} onUpdate={onUpdate} />}
          {activeTab === 'disadvantages' && (
            <DisadvantagesTab character={character} onUpdate={onUpdate} />
          )}
          {activeTab === 'martialarts' && (
            <MartialArtsTab character={character} onUpdate={onUpdate} />
          )}
          {activeTab === 'equipment' && <EquipmentTab character={character} onUpdate={onUpdate} />}
        </div>
      </section>
    </div>
  );
}
