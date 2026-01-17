import { useState } from 'react';
import type { Character, Talent, TalentType, CharacteristicType } from '@hero-workshop/shared';
import { Modal } from './Modal';

interface TalentsTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const TALENT_TYPES: { value: TalentType; label: string; defaultCost: number; description: string }[] = [
  { value: 'ABSOLUTE_RANGE_SENSE', label: 'Absolute Range Sense', defaultCost: 3, description: 'Can accurately determine distance to objects' },
  { value: 'ABSOLUTE_TIME_SENSE', label: 'Absolute Time Sense', defaultCost: 3, description: 'Always knows what time it is' },
  { value: 'AMBIDEXTERITY', label: 'Ambidexterity', defaultCost: 1, description: 'No penalty for off-hand actions' },
  { value: 'BUMP_OF_DIRECTION', label: 'Bump of Direction', defaultCost: 3, description: 'Always knows which way is north' },
  { value: 'COMBAT_LUCK', label: 'Combat Luck', defaultCost: 6, description: '+3 rPD/+3 rED per level' },
  { value: 'DANGER_SENSE', label: 'Danger Sense', defaultCost: 15, description: 'Sense threats before they occur' },
  { value: 'DOUBLE_JOINTED', label: 'Double Jointed', defaultCost: 4, description: '+3 to Contortionist skill rolls' },
  { value: 'EIDETIC_MEMORY', label: 'Eidetic Memory', defaultCost: 5, description: 'Perfect recall of everything experienced' },
  { value: 'ENVIRONMENTAL_MOVEMENT', label: 'Environmental Movement', defaultCost: 2, description: 'No penalties in specific environment' },
  { value: 'LIGHTNING_CALCULATOR', label: 'Lightning Calculator', defaultCost: 3, description: 'Perform complex math instantly' },
  { value: 'LIGHTNING_REFLEXES', label: 'Lightning Reflexes', defaultCost: 1, description: '+1 DEX for initiative per level' },
  { value: 'LIGHTSLEEP', label: 'Lightsleep', defaultCost: 3, description: 'Full PER rolls while sleeping' },
  { value: 'OFF_HAND_DEFENSE', label: 'Off-Hand Defense', defaultCost: 4, description: 'Use weapon for extra DCV' },
  { value: 'PERFECT_PITCH', label: 'Perfect Pitch', defaultCost: 3, description: 'Identify and reproduce any sound' },
  { value: 'RESISTANCE', label: 'Resistance', defaultCost: 1, description: '+1 to EGO rolls to resist per level' },
  { value: 'SIMULATE_DEATH', label: 'Simulate Death', defaultCost: 3, description: 'Appear dead on medical examination' },
  { value: 'SPEED_READING', label: 'Speed Reading', defaultCost: 4, description: 'Read 10x normal speed per level' },
  { value: 'STRIKING_APPEARANCE', label: 'Striking Appearance', defaultCost: 3, description: '+1 to PRE-based rolls per level' },
  { value: 'UNIVERSAL_TRANSLATOR', label: 'Universal Translator', defaultCost: 20, description: 'Understand any language' },
  { value: 'GENERIC', label: 'Custom Talent', defaultCost: 5, description: 'Custom talent' },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function TalentsTab({ character, onUpdate }: TalentsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTalent, setEditingTalent] = useState<Talent | null>(null);
  const [formData, setFormData] = useState({
    type: 'COMBAT_LUCK' as TalentType,
    name: '',
    alias: '',
    notes: '',
    baseCost: 6,
    levels: 1,
    characteristic: undefined as CharacteristicType | undefined,
  });

  const talents = character.talents ?? [];
  const totalCost = talents.reduce((sum, t) => sum + (t.realCost ?? t.baseCost ?? 0), 0);

  const openAddModal = () => {
    setEditingTalent(null);
    const defaultTalent = TALENT_TYPES.find((t) => t.value === 'COMBAT_LUCK')!;
    setFormData({
      type: 'COMBAT_LUCK',
      name: defaultTalent.label,
      alias: '',
      notes: '',
      baseCost: defaultTalent.defaultCost,
      levels: 1,
      characteristic: undefined,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (talent: Talent) => {
    setEditingTalent(talent);
    setFormData({
      type: talent.type,
      name: talent.name,
      alias: talent.alias ?? '',
      notes: talent.notes ?? '',
      baseCost: talent.baseCost,
      levels: talent.levels,
      characteristic: talent.characteristic,
    });
    setIsModalOpen(true);
  };

  const handleTypeChange = (type: TalentType) => {
    const talentType = TALENT_TYPES.find((t) => t.value === type);
    setFormData({
      ...formData,
      type,
      name: talentType?.label ?? type,
      baseCost: talentType?.defaultCost ?? 5,
    });
  };

  const calculateTotalCost = (): number => {
    const talentType = TALENT_TYPES.find((t) => t.value === formData.type);
    if (talentType?.value === 'COMBAT_LUCK' || 
        talentType?.value === 'LIGHTNING_REFLEXES' || 
        talentType?.value === 'RESISTANCE' ||
        talentType?.value === 'SPEED_READING' ||
        talentType?.value === 'STRIKING_APPEARANCE') {
      return formData.baseCost * formData.levels;
    }
    return formData.baseCost;
  };

  const handleSave = () => {
    const totalCostValue = calculateTotalCost();
    const newTalent: Talent = {
      id: editingTalent?.id ?? generateId(),
      name: formData.name || TALENT_TYPES.find((t) => t.value === formData.type)?.label || formData.type,
      alias: formData.alias || undefined,
      type: formData.type,
      notes: formData.notes || undefined,
      baseCost: totalCostValue,
      realCost: totalCostValue,
      levels: formData.levels,
      position: editingTalent?.position ?? talents.length,
      characteristic: formData.characteristic,
    };

    let updatedTalents: Talent[];
    if (editingTalent) {
      updatedTalents = talents.map((t) => (t.id === editingTalent.id ? newTalent : t));
    } else {
      updatedTalents = [...talents, newTalent];
    }

    onUpdate({ ...character, talents: updatedTalents });
    setIsModalOpen(false);
  };

  const handleDelete = (talentId: string) => {
    onUpdate({
      ...character,
      talents: talents.filter((t) => t.id !== talentId),
    });
  };

  const currentTalentType = TALENT_TYPES.find((t) => t.value === formData.type);
  const hasLevels = ['COMBAT_LUCK', 'LIGHTNING_REFLEXES', 'RESISTANCE', 'SPEED_READING', 'STRIKING_APPEARANCE'].includes(formData.type);

  if (talents.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✨</div>
        <div className="empty-state-title">No Talents</div>
        <p>This character has no talents yet.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Talent
        </button>
      </div>
    );
  }

  return (
    <div className="talents-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Talents ({totalCost} pts)</h3>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Talent
          </button>
        </div>
        <div className="item-list">
          {talents.map((talent) => {
            const talentType = TALENT_TYPES.find((t) => t.value === talent.type);
            return (
              <div key={talent.id} className="item-row">
                <div className="item-info">
                  <div className="item-name">
                    {talent.alias ?? talent.name}
                    {talent.levels > 1 && <span className="badge" style={{ marginLeft: '0.5rem' }}>×{talent.levels}</span>}
                  </div>
                  <div className="item-details">
                    {talentType?.description}
                    {talent.notes && ` • ${talent.notes}`}
                  </div>
                </div>
                <div className="item-cost">{talent.realCost ?? talent.baseCost ?? 0}</div>
                <div className="item-actions">
                  <button
                    className="btn-icon-small"
                    onClick={() => openEditModal(talent)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon-small"
                    onClick={() => handleDelete(talent.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTalent ? 'Edit Talent' : 'Add Talent'}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: 'auto' }}>
              Total Cost: {calculateTotalCost()} pts
            </span>
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingTalent ? 'Save Changes' : 'Add Talent'}
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Talent Type</label>
          <select
            className="form-select"
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as TalentType)}
          >
            {TALENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label} ({type.defaultCost} pts)
              </option>
            ))}
          </select>
          {currentTalentType && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {currentTalentType.description}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Display Name (optional)</label>
          <input
            type="text"
            className="form-input"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder={formData.name}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Cost per Level</label>
            <input
              type="number"
              className="form-input"
              value={formData.baseCost}
              onChange={(e) => setFormData({ ...formData, baseCost: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
          {hasLevels && (
            <div className="form-group">
              <label className="form-label">Levels</label>
              <input
                type="number"
                className="form-input"
                value={formData.levels}
                onChange={(e) => setFormData({ ...formData, levels: parseInt(e.target.value) || 1 })}
                min={1}
              />
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional details..."
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
