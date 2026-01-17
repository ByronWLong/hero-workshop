import { useState } from 'react';
import type { Character, Disadvantage, DisadvantageType } from '@hero-workshop/shared';
import { Modal } from './Modal';

interface DisadvantagesTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const DISADVANTAGE_TYPES: { value: DisadvantageType; label: string; description: string; defaultPoints: number }[] = [
  { value: 'PSYCHOLOGICAL_COMPLICATION', label: 'Psychological Complication', description: 'Mental quirks, phobias, codes of conduct', defaultPoints: 15 },
  { value: 'PHYSICAL_COMPLICATION', label: 'Physical Complication', description: 'Physical disabilities or limitations', defaultPoints: 15 },
  { value: 'SOCIAL_COMPLICATION', label: 'Social Complication', description: 'Social problems, secret identity, fame', defaultPoints: 15 },
  { value: 'HUNTED', label: 'Hunted', description: 'An enemy actively seeks the character', defaultPoints: 15 },
  { value: 'DEPENDENT_NPC', label: 'Dependent NPC', description: 'Someone the character must protect', defaultPoints: 15 },
  { value: 'DISTINCTIVE_FEATURES', label: 'Distinctive Features', description: 'Noticeable characteristics', defaultPoints: 10 },
  { value: 'ENRAGED', label: 'Enraged/Berserk', description: 'Loses control in certain situations', defaultPoints: 15 },
  { value: 'NEGATIVE_REPUTATION', label: 'Negative Reputation', description: 'Known for something bad', defaultPoints: 10 },
  { value: 'RIVALRY', label: 'Rivalry', description: 'Competes with another person', defaultPoints: 10 },
  { value: 'VULNERABILITY', label: 'Vulnerability', description: 'Takes extra damage from something', defaultPoints: 15 },
  { value: 'SUSCEPTIBILITY', label: 'Susceptibility', description: 'Takes damage from uncommon source', defaultPoints: 10 },
  { value: 'DEPENDENCE', label: 'Dependence', description: 'Must have access to something', defaultPoints: 15 },
  { value: 'ACCIDENTAL_CHANGE', label: 'Accidental Change', description: 'Uncontrolled transformation', defaultPoints: 15 },
  { value: 'UNLUCK', label: 'Unluck', description: 'Bad things happen', defaultPoints: 5 },
  { value: 'GENERIC', label: 'Custom Complication', description: 'Custom complication', defaultPoints: 10 },
];

const FREQUENCY_OPTIONS = [
  { label: 'Uncommon', modifier: 0, description: '8- or less' },
  { label: 'Common', modifier: 5, description: '11- or less' },
  { label: 'Very Common', modifier: 10, description: '14- or less' },
];

const INTENSITY_OPTIONS = [
  { label: 'Moderate', modifier: 0 },
  { label: 'Strong', modifier: 5 },
  { label: 'Total', modifier: 10 },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function DisadvantagesTab({ character, onUpdate }: DisadvantagesTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDisad, setEditingDisad] = useState<Disadvantage | null>(null);
  const [formData, setFormData] = useState({
    type: 'PSYCHOLOGICAL_COMPLICATION' as DisadvantageType,
    name: '',
    alias: '',
    notes: '',
    basePoints: 15,
    frequency: 0,
    intensity: 0,
  });

  const disadvantages = character.disadvantages ?? [];
  const totalPoints = disadvantages.reduce((sum, d) => sum + (d.points ?? 0), 0);
  const maxPoints = character.basicConfiguration.disadPoints;

  const openAddModal = () => {
    setEditingDisad(null);
    setFormData({
      type: 'PSYCHOLOGICAL_COMPLICATION',
      name: '',
      alias: '',
      notes: '',
      basePoints: 15,
      frequency: 0,
      intensity: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (disad: Disadvantage) => {
    setEditingDisad(disad);
    setFormData({
      type: disad.type,
      name: disad.name,
      alias: disad.alias ?? '',
      notes: disad.notes ?? '',
      basePoints: disad.points ?? 15,
      frequency: 0,
      intensity: 0,
    });
    setIsModalOpen(true);
  };

  const handleTypeChange = (type: DisadvantageType) => {
    const disadType = DISADVANTAGE_TYPES.find((d) => d.value === type);
    setFormData({
      ...formData,
      type,
      name: disadType?.label ?? type,
      basePoints: disadType?.defaultPoints ?? 10,
    });
  };

  const calculatePoints = (): number => {
    return formData.basePoints + formData.frequency + formData.intensity;
  };

  const handleSave = () => {
    const points = calculatePoints();
    
    const newDisad: Disadvantage = {
      id: editingDisad?.id ?? generateId(),
      name: formData.name || DISADVANTAGE_TYPES.find((d) => d.value === formData.type)?.label || 'Complication',
      alias: formData.alias || undefined,
      type: formData.type,
      notes: formData.notes || undefined,
      baseCost: points,
      realCost: points,
      levels: 1,
      position: editingDisad?.position ?? disadvantages.length,
      points,
    };

    let updatedDisads: Disadvantage[];
    if (editingDisad) {
      updatedDisads = disadvantages.map((d) => (d.id === editingDisad.id ? newDisad : d));
    } else {
      updatedDisads = [...disadvantages, newDisad];
    }

    onUpdate({ ...character, disadvantages: updatedDisads });
    setIsModalOpen(false);
  };

  const handleDelete = (disadId: string) => {
    onUpdate({
      ...character,
      disadvantages: disadvantages.filter((d) => d.id !== disadId),
    });
  };

  const currentType = DISADVANTAGE_TYPES.find((d) => d.value === formData.type);
  const pointsPercentage = Math.min((totalPoints / maxPoints) * 100, 100);

  if (disadvantages.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">No Complications</div>
        <p>This character has no complications yet.</p>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          Complications provide up to {maxPoints} additional character points.
        </p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Complication
        </button>
      </div>
    );
  }

  return (
    <div className="disadvantages-tab">
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Complications</h3>
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ 
                width: '200px', 
                height: '8px', 
                background: 'var(--surface-light)', 
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${pointsPercentage}%`, 
                  height: '100%', 
                  background: totalPoints >= maxPoints ? 'var(--success)' : 'var(--warning)',
                  transition: 'width 0.3s'
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {totalPoints} / {maxPoints} points
              </div>
            </div>
          </div>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Complication
          </button>
        </div>
        <div className="item-list">
          {disadvantages.map((disad) => {
            return (
              <div key={disad.id} className="item-row">
                <div className="item-info">
                  <div className="item-name">
                    <span className="badge" style={{ marginRight: '0.5rem' }}>{disad.alias}</span>
                    {disad.name}
                  </div>
                  {disad.notes && (
                    <div className="item-details">
                      {disad.notes}
                    </div>
                  )}
                </div>
                <div className="item-cost" style={{ color: 'var(--warning)' }}>
                  {disad.points ?? 0}
                </div>
                <div className="item-actions">
                  <button
                    className="btn-icon-small"
                    onClick={() => openEditModal(disad)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon-small"
                    onClick={() => handleDelete(disad.id)}
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
        title={editingDisad ? 'Edit Complication' : 'Add Complication'}
        size="medium"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ color: 'var(--warning)', marginRight: 'auto', fontWeight: 600 }}>
              Points: {calculatePoints()}
            </span>
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingDisad ? 'Save Changes' : 'Add Complication'}
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Complication Type</label>
          <select
            className="form-select"
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as DisadvantageType)}
          >
            {DISADVANTAGE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {currentType && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {currentType.description}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <input
            type="text"
            className="form-input"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder="e.g., Code vs. Killing, Hunted by VIPER"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Base Points</label>
            <input
              type="number"
              className="form-input"
              value={formData.basePoints}
              onChange={(e) => setFormData({ ...formData, basePoints: parseInt(e.target.value) || 0 })}
              min={0}
              max={50}
              step={5}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Frequency</label>
            <select
              className="form-select"
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: parseInt(e.target.value) })}
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.modifier}>
                  {opt.label} ({opt.description}) {opt.modifier > 0 && `+${opt.modifier}`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Intensity</label>
            <select
              className="form-select"
              value={formData.intensity}
              onChange={(e) => setFormData({ ...formData, intensity: parseInt(e.target.value) })}
            >
              {INTENSITY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.modifier}>
                  {opt.label} {opt.modifier > 0 && `+${opt.modifier}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Details about this complication..."
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
