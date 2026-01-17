import { useState } from 'react';
import type { Character, MartialManeuver } from '@hero-workshop/shared';
import { Modal } from './Modal';

interface MartialArtsTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Common martial maneuvers from HERO System 6E
const COMMON_MANEUVERS = [
  { name: 'Block', ocv: '+0', dcv: '+0', effect: 'Block, Abort', baseCost: 4 },
  { name: 'Disarm', ocv: '-2', dcv: '+0', effect: 'Disarm, STR vs STR', baseCost: 4 },
  { name: 'Dodge', ocv: '--', dcv: '+3', effect: 'Abort, vs. all attacks', baseCost: 4 },
  { name: 'Escape', ocv: '+0', dcv: '+0', effect: '+15 STR vs. Grabs', baseCost: 4 },
  { name: 'Fast Strike', ocv: '+2', dcv: '+0', effect: 'STR +2d6 Strike', baseCost: 4 },
  { name: 'Flying Dodge', ocv: '--', dcv: '+4', effect: 'Abort, FMove', baseCost: 5 },
  { name: 'Flying Grab', ocv: '-2', dcv: '-1', effect: 'Grab, FMove', baseCost: 4 },
  { name: 'Grab', ocv: '-1', dcv: '-2', effect: 'Grab, +10 STR for holding', baseCost: 3 },
  { name: 'Kick', ocv: '-2', dcv: '+1', effect: 'STR +4d6 Strike', baseCost: 5 },
  { name: 'Killing Strike', ocv: '-2', dcv: '+0', effect: '1/2 STR HKA', baseCost: 4 },
  { name: 'Legsweep', ocv: '+2', dcv: '-1', effect: 'STR +1d6 Strike, Target Falls', baseCost: 3 },
  { name: 'Martial Throw', ocv: '+0', dcv: '+2', effect: 'STR +2d6 Strike, Target Falls', baseCost: 3 },
  { name: 'Nerve Strike', ocv: '-1', dcv: '+1', effect: '2d6 NND', baseCost: 4 },
  { name: 'Offensive Strike', ocv: '-2', dcv: '+1', effect: 'STR +4d6 Strike', baseCost: 5 },
  { name: 'Passing Strike', ocv: '+1', dcv: '+0', effect: 'STR +2d6 Strike, FMove', baseCost: 5 },
  { name: 'Sacrifice Throw', ocv: '+2', dcv: '+1', effect: 'STR Strike, Both Fall', baseCost: 3 },
  { name: 'Strike', ocv: '+0', dcv: '+2', effect: 'STR +2d6 Strike', baseCost: 4 },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function parseOcvDcv(value: string): number {
  if (value === '--') return 0;
  return parseInt(value.replace('+', ''), 10) || 0;
}

export function MartialArtsTab({ character, onUpdate }: MartialArtsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManeuver, setEditingManeuver] = useState<MartialManeuver | null>(null);
  const [selectedCommon, setSelectedCommon] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    ocv: 0,
    dcv: 0,
    effect: '',
    baseCost: 4,
  });

  const maneuvers = character.martialArts ?? [];
  const totalCost = maneuvers.reduce((sum, m) => sum + (m.realCost ?? m.baseCost ?? 0), 0);

  const openAddModal = () => {
    setEditingManeuver(null);
    setSelectedCommon('');
    setFormData({
      name: '',
      alias: '',
      notes: '',
      ocv: 0,
      dcv: 0,
      effect: '',
      baseCost: 4,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (maneuver: MartialManeuver) => {
    setEditingManeuver(maneuver);
    setSelectedCommon('');
    setFormData({
      name: maneuver.name,
      alias: maneuver.alias ?? '',
      notes: maneuver.notes ?? '',
      ocv: maneuver.ocv,
      dcv: maneuver.dcv,
      effect: maneuver.effect ?? '',
      baseCost: maneuver.baseCost,
    });
    setIsModalOpen(true);
  };

  const handleCommonSelect = (name: string) => {
    setSelectedCommon(name);
    const maneuver = COMMON_MANEUVERS.find((m) => m.name === name);
    if (maneuver) {
      setFormData({
        ...formData,
        name: maneuver.name,
        ocv: parseOcvDcv(maneuver.ocv),
        dcv: parseOcvDcv(maneuver.dcv),
        effect: maneuver.effect,
        baseCost: maneuver.baseCost,
      });
    }
  };

  const handleSave = () => {
    const newManeuver: MartialManeuver = {
      id: editingManeuver?.id ?? generateId(),
      name: formData.name || 'Maneuver',
      alias: formData.alias || undefined,
      notes: formData.notes || undefined,
      baseCost: formData.baseCost,
      realCost: formData.baseCost,
      levels: 0,
      position: editingManeuver?.position ?? maneuvers.length,
      ocv: formData.ocv,
      dcv: formData.dcv,
      effect: formData.effect || undefined,
    };

    let updatedManeuvers: MartialManeuver[];
    if (editingManeuver) {
      updatedManeuvers = maneuvers.map((m) => (m.id === editingManeuver.id ? newManeuver : m));
    } else {
      updatedManeuvers = [...maneuvers, newManeuver];
    }

    onUpdate({ ...character, martialArts: updatedManeuvers });
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    onUpdate({
      ...character,
      martialArts: maneuvers.filter((m) => m.id !== id),
    });
  };

  const formatOcvDcv = (value: number): string => {
    if (value === 0) return '+0';
    return value > 0 ? `+${value}` : `${value}`;
  };

  if (maneuvers.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🥋</div>
        <div className="empty-state-title">No Martial Arts</div>
        <p>This character has no martial maneuvers.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Maneuver
        </button>
      </div>
    );
  }

  return (
    <div className="martial-arts-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Martial Arts ({totalCost} pts)</h3>
          <button className="btn btn-primary" onClick={openAddModal}>Add Maneuver</button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Maneuver</th>
              <th style={{ textAlign: 'center' }}>OCV</th>
              <th style={{ textAlign: 'center' }}>DCV</th>
              <th>Effect</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {maneuvers.map((maneuver) => (
              <tr key={maneuver.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{maneuver.name}</div>
                  {maneuver.notes && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {maneuver.notes}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>{formatOcvDcv(maneuver.ocv)}</td>
                <td style={{ textAlign: 'center' }}>{formatOcvDcv(maneuver.dcv)}</td>
                <td style={{ fontSize: '0.875rem' }}>{maneuver.effect ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{maneuver.realCost ?? maneuver.baseCost ?? 0}</td>
                <td>
                  <div className="item-actions">
                    <button
                      className="btn-icon-small"
                      onClick={() => openEditModal(maneuver)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon-small"
                      onClick={() => handleDelete(maneuver.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingManeuver ? 'Edit Maneuver' : 'Add Maneuver'}
      >
        <div className="form-group">
          <label className="form-label">Quick Select</label>
          <select
            className="form-select"
            value={selectedCommon}
            onChange={(e) => handleCommonSelect(e.target.value)}
          >
            <option value="">-- Select Common Maneuver --</option>
            {COMMON_MANEUVERS.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.baseCost} pts)
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Name *</label>
          <input
            type="text"
            className="form-input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Strike, Block, Throw..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Display Name (Alias)</label>
          <input
            type="text"
            className="form-input"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder="Custom name for this maneuver..."
          />
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">OCV Modifier</label>
            <input
              type="number"
              className="form-input"
              value={formData.ocv}
              onChange={(e) => setFormData({ ...formData, ocv: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">DCV Modifier</label>
            <input
              type="number"
              className="form-input"
              value={formData.dcv}
              onChange={(e) => setFormData({ ...formData, dcv: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Cost</label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={formData.baseCost}
              onChange={(e) => setFormData({ ...formData, baseCost: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Effect</label>
          <input
            type="text"
            className="form-input"
            value={formData.effect}
            onChange={(e) => setFormData({ ...formData, effect: e.target.value })}
            placeholder="STR +2d6 Strike, Block, etc."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {editingManeuver ? 'Update' : 'Add'} Maneuver
          </button>
        </div>
      </Modal>
    </div>
  );
}
