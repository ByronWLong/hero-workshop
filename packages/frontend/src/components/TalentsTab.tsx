import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Character, Talent, TalentType, CharacteristicType, Adder } from '@hero-workshop/shared';
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

/** Represents a talent entry that might be a group with children */
interface TalentDisplayItem {
  talent: Talent;
  children: Talent[];
}

export function TalentsTab({ character, onUpdate }: TalentsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingTalent, setEditingTalent] = useState<Talent | null>(null);
  const [editingGroup, setEditingGroup] = useState<Talent | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [moveMenuOpenFor, setMoveMenuOpenFor] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'COMBAT_LUCK' as TalentType,
    name: '',
    alias: '',
    notes: '',
    baseCost: 6,
    levels: 1,
    characteristic: undefined as CharacteristicType | undefined,
  });
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    discountAdder: 0,
  });

  const talents = useMemo(() => character.talents ?? [], [character.talents]);
  
  // Close move menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-move-menu]')) {
      setMoveMenuOpenFor(null);
    }
  }, []);

  useEffect(() => {
    if (moveMenuOpenFor) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [moveMenuOpenFor, handleClickOutside]);

  // Calculate total cost (only count non-group talents)
  const totalCost = talents.reduce((sum, t) => {
    if (t.isGroup) return sum;
    return sum + (t.realCost ?? t.baseCost ?? 0);
  }, 0);

  // Get available groups for moving a talent
  const getAvailableGroups = (talent: Talent): Talent[] => {
    return talents.filter(t => t.isGroup && t.id !== talent.id);
  };

  // Organize talents into a hierarchical display structure
  const displayItems = useMemo(() => {
    const items: TalentDisplayItem[] = [];
    const childrenMap = new Map<string, Talent[]>();
    
    // First pass: identify parents and group children
    for (const talent of talents) {
      if (talent.isGroup) {
        childrenMap.set(talent.id, []);
      }
    }
    
    // Second pass: assign children to parents
    for (const talent of talents) {
      if (!talent.isGroup && talent.parentId) {
        const children = childrenMap.get(talent.parentId);
        if (children) {
          children.push(talent);
        }
      }
    }
    
    // Build display items in position order
    for (const talent of talents) {
      if (talent.isGroup) {
        items.push({
          talent,
          children: childrenMap.get(talent.id) || [],
        });
      } else if (!talent.parentId) {
        items.push({
          talent,
          children: [],
        });
      }
    }
    
    return items;
  }, [talents]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Get group discount (from adders)
  const getGroupDiscount = (group: Talent): number => {
    if (!group.adders) return 0;
    return group.adders.reduce((sum, a) => sum + (a.baseCost < 0 ? a.baseCost : 0), 0);
  };

  // Move a talent to a group (or remove from group)
  const handleMoveToGroup = (talentId: string, parentId: string | null) => {
    const updatedTalents = talents.map(t => {
      if (t.id === talentId) {
        let discount = 0;
        if (parentId) {
          const parent = talents.find(p => p.id === parentId);
          if (parent?.adders) {
            discount = parent.adders.reduce((sum, a) => sum + (a.baseCost < 0 ? a.baseCost : 0), 0);
          }
        }
        
        const baseRealCost = t.baseCost;
        const newRealCost = Math.max(0, baseRealCost + discount);
        
        return {
          ...t,
          parentId: parentId ?? undefined,
          realCost: newRealCost,
        };
      }
      return t;
    });
    
    onUpdate({ ...character, talents: updatedTalents });
    setMoveMenuOpenFor(null);
  };

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

  const openAddGroupModal = () => {
    setEditingGroup(null);
    setGroupFormData({ name: '', discountAdder: 0 });
    setIsGroupModalOpen(true);
  };

  const openEditGroupModal = (group: Talent) => {
    setEditingGroup(group);
    const discount = getGroupDiscount(group);
    setGroupFormData({
      name: group.name,
      discountAdder: discount,
    });
    setIsGroupModalOpen(true);
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

  const calculateTotalCostValue = (): number => {
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
    const totalCostValue = calculateTotalCostValue();
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
      parentId: editingTalent?.parentId,
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

  const handleSaveGroup = () => {
    const adders: Adder[] = [];
    if (groupFormData.discountAdder !== 0) {
      adders.push({
        id: generateId(),
        name: 'Group Discount',
        alias: `${groupFormData.discountAdder} pt`,
        baseCost: groupFormData.discountAdder,
        levels: 0,
      });
    }

    if (editingGroup) {
      const oldDiscount = getGroupDiscount(editingGroup);
      const newDiscount = groupFormData.discountAdder;

      const updatedTalents = talents.map(t => {
        if (t.id === editingGroup.id) {
          return {
            ...t,
            name: groupFormData.name || 'Talent Group',
            adders: adders.length > 0 ? adders : undefined,
          };
        }
        if (t.parentId === editingGroup.id && oldDiscount !== newDiscount) {
          return {
            ...t,
            realCost: Math.max(0, t.baseCost + newDiscount),
          };
        }
        return t;
      });

      onUpdate({ ...character, talents: updatedTalents });
    } else {
      const newGroup: Talent = {
        id: generateId(),
        name: groupFormData.name || 'Talent Group',
        type: 'GENERIC',
        baseCost: 0,
        realCost: 0,
        levels: 0,
        position: talents.length,
        isGroup: true,
        adders: adders.length > 0 ? adders : undefined,
      };

      onUpdate({ ...character, talents: [...talents, newGroup] });
    }

    setIsGroupModalOpen(false);
    setEditingGroup(null);
  };

  const handleDelete = (talentId: string) => {
    onUpdate({
      ...character,
      talents: talents.filter((t) => t.id !== talentId),
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const updatedTalents = talents
      .filter(t => t.id !== groupId)
      .map(t => {
        if (t.parentId === groupId) {
          return { ...t, parentId: undefined, realCost: t.baseCost };
        }
        return t;
      });
    onUpdate({ ...character, talents: updatedTalents });
  };

  const currentTalentType = TALENT_TYPES.find((t) => t.value === formData.type);
  const hasLevels = ['COMBAT_LUCK', 'LIGHTNING_REFLEXES', 'RESISTANCE', 'SPEED_READING', 'STRIKING_APPEARANCE'].includes(formData.type);

  if (talents.length === 0 && !isModalOpen && !isGroupModalOpen) {
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

  const renderTalentRow = (talent: Talent, isChild: boolean = false) => {
    const talentType = TALENT_TYPES.find((t) => t.value === talent.type);
    const availableGroups = getAvailableGroups(talent);
    const cost = talent.realCost ?? talent.baseCost ?? 0;

    return (
      <div key={talent.id} className="item-row" style={{ paddingLeft: isChild ? '2rem' : undefined }}>
        <div className="item-info">
          <div className="item-name">
            {isChild && <span style={{ marginRight: '0.5rem' }}>›</span>}
            {talent.alias ?? talent.name}
            {talent.levels > 1 && <span className="badge" style={{ marginLeft: '0.5rem' }}>×{talent.levels}</span>}
          </div>
          <div className="item-details">
            {talentType?.description}
            {talent.notes && ` • ${talent.notes}`}
          </div>
        </div>
        <div className="item-cost">{cost > 0 ? cost : '—'}</div>
        <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {/* Move to group menu */}
          {(availableGroups.length > 0 || talent.parentId) && (
            <div data-move-menu style={{ position: 'relative' }}>
              <button
                className="btn-icon-small"
                onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === talent.id ? null : talent.id)}
                title="Move to group"
                style={{ 
                  background: moveMenuOpenFor === talent.id ? 'var(--surface)' : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
              </button>
              {moveMenuOpenFor === talent.id && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  zIndex: 1000,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.375rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  minWidth: '180px',
                  maxHeight: '250px',
                  overflowY: 'auto',
                }}>
                  {talent.parentId && (
                    <div
                      style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                      onClick={() => handleMoveToGroup(talent.id, null)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      — None —
                    </div>
                  )}
                  {availableGroups.filter(g => g.id !== talent.parentId).map(group => (
                    <div
                      key={group.id}
                      style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                      onClick={() => handleMoveToGroup(talent.id, group.id)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      {group.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
  };

  return (
    <div className="talents-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Talents ({totalCost} pts)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={openAddGroupModal}>
              Add Group
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>
              Add Talent
            </button>
          </div>
        </div>
        <div className="item-list">
          {displayItems.map((item) => {
            const { talent, children } = item;
            const isCollapsed = collapsedGroups.has(talent.id);
            const discount = talent.isGroup ? getGroupDiscount(talent) : 0;

            if (talent.isGroup) {
              const groupTotal = children.reduce((sum, c) => sum + (c.realCost ?? c.baseCost ?? 0), 0);
              return (
                <div key={talent.id} className="skill-group">
                  <div
                    className="item-row group-header"
                    onClick={() => toggleGroup(talent.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="item-info">
                      <span style={{ marginRight: '0.5rem' }}>{isCollapsed ? '▶' : '▼'}</span>
                      <strong>{talent.name}</strong>
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                        ({children.length} talents)
                      </span>
                      {discount !== 0 && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Discount: {discount} pt
                        </span>
                      )}
                    </div>
                    <div className="item-cost">{groupTotal}</div>
                    <div className="item-actions">
                      <button
                        className="btn-icon-small"
                        onClick={(e) => { e.stopPropagation(); openEditGroupModal(talent); }}
                        title="Edit Group"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(talent.id); }}
                        title="Delete Group"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && children.map((child) => renderTalentRow(child, true))}
                </div>
              );
            }

            return renderTalentRow(talent);
          })}
        </div>
      </div>

      {/* Add/Edit Talent Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTalent ? 'Edit Talent' : 'Add Talent'}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: 'auto' }}>
              Total Cost: {calculateTotalCostValue()} pts
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

      {/* Add/Edit Group Modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        title={editingGroup ? 'Edit Talent Group' : 'Add Talent Group'}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIsGroupModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveGroup}>
              {editingGroup ? 'Save Changes' : 'Add Group'}
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Group Name</label>
          <input
            type="text"
            className="form-input"
            value={groupFormData.name}
            onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
            placeholder="e.g., Racial Talents, Magic Talents"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cost Discount (per talent)</label>
          <input
            type="number"
            className="form-input"
            value={groupFormData.discountAdder}
            onChange={(e) => setGroupFormData({ ...groupFormData, discountAdder: parseInt(e.target.value) || 0 })}
            max={0}
          />
          <small style={{ color: 'var(--text-secondary)' }}>
            Enter a negative number (e.g., -1) to discount each talent in this group
          </small>
        </div>
      </Modal>
    </div>
  );
}
