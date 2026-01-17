import { useState } from 'react';
import type { Character, Perk, PerkType } from '@hero-workshop/shared';
import { Modal } from './Modal';

interface PerksTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const PERK_TYPES: { value: PerkType; label: string; defaultCost: number }[] = [
  { value: 'ANONYMITY', label: 'Anonymity', defaultCost: 3 },
  { value: 'BASE', label: 'Base', defaultCost: 1 },
  { value: 'COMPUTER_LINK', label: 'Computer Link', defaultCost: 1 },
  { value: 'CONTACT', label: 'Contact', defaultCost: 1 },
  { value: 'DEEP_COVER', label: 'Deep Cover', defaultCost: 2 },
  { value: 'FAVOR', label: 'Favor', defaultCost: 1 },
  { value: 'FOLLOWER', label: 'Follower', defaultCost: 1 },
  { value: 'FRINGE_BENEFIT', label: 'Fringe Benefit', defaultCost: 1 },
  { value: 'MONEY', label: 'Money', defaultCost: 0 },
  { value: 'POSITIVE_REPUTATION', label: 'Positive Reputation', defaultCost: 1 },
  { value: 'REPUTATION', label: 'Reputation', defaultCost: 1 },
  { value: 'VEHICLE', label: 'Vehicle', defaultCost: 1 },
  { value: 'VEHICLE_BASE', label: 'Vehicles & Bases', defaultCost: 1 },
  { value: 'GENERIC', label: 'Custom Perk', defaultCost: 1 },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function PerksTab({ character, onUpdate }: PerksTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerk, setEditingPerk] = useState<Perk | null>(null);
  const [formData, setFormData] = useState({
    type: 'CONTACT' as PerkType,
    name: '',
    alias: '',
    notes: '',
    baseCost: 1,
    levels: 1,
  });

  const perks = character.perks ?? [];
  const totalCost = perks.reduce((sum, p) => sum + (p.realCost ?? p.baseCost ?? 0), 0);

  const openAddModal = () => {
    setEditingPerk(null);
    setFormData({
      type: 'CONTACT',
      name: '',
      alias: '',
      notes: '',
      baseCost: 1,
      levels: 1,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (perk: Perk) => {
    setEditingPerk(perk);
    setFormData({
      type: perk.type,
      name: perk.name,
      alias: perk.alias ?? '',
      notes: perk.notes ?? '',
      baseCost: perk.baseCost,
      levels: perk.levels,
    });
    setIsModalOpen(true);
  };

  const handleTypeChange = (type: PerkType) => {
    const perkType = PERK_TYPES.find((p) => p.value === type);
    setFormData({
      ...formData,
      type,
      name: perkType?.label ?? type,
      baseCost: perkType?.defaultCost ?? 1,
    });
  };

  const handleSave = () => {
    const newPerk: Perk = {
      id: editingPerk?.id ?? generateId(),
      name: formData.name || PERK_TYPES.find((p) => p.value === formData.type)?.label || formData.type,
      alias: formData.alias || undefined,
      type: formData.type,
      notes: formData.notes || undefined,
      baseCost: formData.baseCost,
      realCost: formData.baseCost,
      levels: formData.levels,
      position: editingPerk?.position ?? perks.length,
    };

    let updatedPerks: Perk[];
    if (editingPerk) {
      updatedPerks = perks.map((p) => (p.id === editingPerk.id ? newPerk : p));
    } else {
      updatedPerks = [...perks, newPerk];
    }

    onUpdate({ ...character, perks: updatedPerks });
    setIsModalOpen(false);
  };

  const handleDelete = (perkId: string) => {
    onUpdate({
      ...character,
      perks: perks.filter((p) => p.id !== perkId),
    });
  };

  if (perks.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎖️</div>
        <div className="empty-state-title">No Perks</div>
        <p>This character has no perks yet.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Perk
        </button>
      </div>
    );
  }

  return (
    <div className="perks-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Perks ({totalCost} pts)</h3>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Perk
          </button>
        </div>
        <div className="item-list">
          {perks.map((perk) => (
            <div key={perk.id} className="item-row">
              <div className="item-info">
                <div className="item-name">{perk.name}</div>
                {perk.notes && <div className="item-details">{perk.notes}</div>}
              </div>
              <div className="item-cost">{perk.realCost ?? perk.baseCost ?? 0}</div>
              <div className="item-actions">
                <button
                  className="btn-icon-small"
                  onClick={() => openEditModal(perk)}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  className="btn-icon-small"
                  onClick={() => handleDelete(perk.id)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPerk ? 'Edit Perk' : 'Add Perk'}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingPerk ? 'Save Changes' : 'Add Perk'}
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Perk Type</label>
          <select
            className="form-select"
            value={formData.type}
            onChange={(e) => handleTypeChange(e.target.value as PerkType)}
          >
            {PERK_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input
            type="text"
            className="form-input"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder={formData.name || 'e.g., FBI Contact, Wealthy'}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Cost</label>
            <input
              type="number"
              className="form-input"
              value={formData.baseCost}
              onChange={(e) => setFormData({ ...formData, baseCost: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
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
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Description or details..."
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
