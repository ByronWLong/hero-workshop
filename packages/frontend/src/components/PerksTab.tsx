import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Character, Perk, PerkType, Adder } from '@hero-workshop/shared';
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

/** Represents a perk entry that might be a group with children */
interface PerkDisplayItem {
  perk: Perk;
  children: Perk[];
}

export function PerksTab({ character, onUpdate }: PerksTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingPerk, setEditingPerk] = useState<Perk | null>(null);
  const [editingGroup, setEditingGroup] = useState<Perk | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [moveMenuOpenFor, setMoveMenuOpenFor] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'CONTACT' as PerkType,
    name: '',
    alias: '',
    notes: '',
    baseCost: 1,
    levels: 1,
  });
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    discountAdder: 0,
  });

  const perks = useMemo(() => character.perks ?? [], [character.perks]);

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

  // Get available groups for moving a perk
  const getAvailableGroups = (perk: Perk): Perk[] => {
    return perks.filter(p => p.isGroup && p.id !== perk.id);
  };

  // Move a perk to a group (or remove from group)
  const handleMoveToGroup = (perkId: string, parentId: string | null) => {
    const updatedPerks = perks.map(p => {
      if (p.id === perkId) {
        let discount = 0;
        if (parentId) {
          const parent = perks.find(pr => pr.id === parentId);
          if (parent?.adders) {
            discount = parent.adders.reduce((sum, a) => sum + (a.baseCost < 0 ? a.baseCost : 0), 0);
          }
        }
        
        const baseRealCost = p.baseCost;
        const newRealCost = Math.max(0, baseRealCost + discount);
        
        return {
          ...p,
          parentId: parentId ?? undefined,
          realCost: newRealCost,
        };
      }
      return p;
    });
    
    onUpdate({ ...character, perks: updatedPerks });
    setMoveMenuOpenFor(null);
  };
  
  // Calculate total cost (only count non-group perks)
  const totalCost = perks.reduce((sum, p) => {
    if (p.isGroup) return sum;
    return sum + (p.realCost ?? p.baseCost ?? 0);
  }, 0);

  // Organize perks into a hierarchical display structure
  const displayItems = useMemo(() => {
    const items: PerkDisplayItem[] = [];
    const childrenMap = new Map<string, Perk[]>();
    
    // First pass: identify parents and group children
    for (const perk of perks) {
      if (perk.isGroup) {
        childrenMap.set(perk.id, []);
      }
    }
    
    // Second pass: assign children to parents
    for (const perk of perks) {
      if (!perk.isGroup && perk.parentId) {
        const children = childrenMap.get(perk.parentId);
        if (children) {
          children.push(perk);
        }
      }
    }
    
    // Build display items in position order
    for (const perk of perks) {
      if (perk.isGroup) {
        items.push({
          perk,
          children: childrenMap.get(perk.id) || [],
        });
      } else if (!perk.parentId) {
        items.push({
          perk,
          children: [],
        });
      }
    }
    
    return items;
  }, [perks]);

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
  const getGroupDiscount = (group: Perk): number => {
    if (!group.adders) return 0;
    return group.adders.reduce((sum, a) => sum + (a.baseCost < 0 ? a.baseCost : 0), 0);
  };

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

  const openAddGroupModal = () => {
    setEditingGroup(null);
    setGroupFormData({ name: '', discountAdder: 0 });
    setIsGroupModalOpen(true);
  };

  const openEditGroupModal = (group: Perk) => {
    setEditingGroup(group);
    const discount = getGroupDiscount(group);
    setGroupFormData({
      name: group.name,
      discountAdder: discount,
    });
    setIsGroupModalOpen(true);
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
      // Update existing group and recalculate child costs
      const oldDiscount = getGroupDiscount(editingGroup);
      const newDiscount = groupFormData.discountAdder;

      const updatedPerks = perks.map(p => {
        if (p.id === editingGroup.id) {
          return {
            ...p,
            name: groupFormData.name || 'Perk Group',
            adders: adders.length > 0 ? adders : undefined,
          };
        }
        // Recalculate child costs if discount changed
        if (p.parentId === editingGroup.id && oldDiscount !== newDiscount) {
          return {
            ...p,
            realCost: Math.max(0, p.baseCost + newDiscount),
          };
        }
        return p;
      });

      onUpdate({ ...character, perks: updatedPerks });
    } else {
      // Create new group
      const newGroup: Perk = {
        id: generateId(),
        name: groupFormData.name || 'Perk Group',
        type: 'GENERIC',
        baseCost: 0,
        realCost: 0,
        levels: 0,
        position: perks.length,
        isGroup: true,
        adders: adders.length > 0 ? adders : undefined,
      };

      onUpdate({ ...character, perks: [...perks, newGroup] });
    }

    setIsGroupModalOpen(false);
    setEditingGroup(null);
  };

  const handleDelete = (perkId: string) => {
    onUpdate({
      ...character,
      perks: perks.filter((p) => p.id !== perkId),
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    // Remove group and unparent its children
    const updatedPerks = perks
      .filter(p => p.id !== groupId)
      .map(p => {
        if (p.parentId === groupId) {
          return { ...p, parentId: undefined, realCost: p.baseCost };
        }
        return p;
      });
    onUpdate({ ...character, perks: updatedPerks });
  };

  if (perks.length === 0 && !isModalOpen && !isGroupModalOpen) {
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={openAddGroupModal}>
              Add Group
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>
              Add Perk
            </button>
          </div>
        </div>
        <div className="item-list">
          {displayItems.map((item) => {
            const { perk, children } = item;
            const isCollapsed = collapsedGroups.has(perk.id);
            const discount = perk.isGroup ? getGroupDiscount(perk) : 0;

            if (perk.isGroup) {
              // Render group header with children
              const groupTotal = children.reduce((sum, c) => sum + (c.realCost ?? c.baseCost ?? 0), 0);
              return (
                <div key={perk.id} className="skill-group">
                  <div
                    className="item-row group-header"
                    onClick={() => toggleGroup(perk.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="item-info">
                      <span style={{ marginRight: '0.5rem' }}>{isCollapsed ? '▶' : '▼'}</span>
                      <strong>{perk.name}</strong>
                      <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                        ({children.length} perks)
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
                        onClick={(e) => { e.stopPropagation(); openEditGroupModal(perk); }}
                        title="Edit Group"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(perk.id); }}
                        title="Delete Group"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && children.map((child) => {
                    const availableGroups = getAvailableGroups(child);
                    return (
                      <div key={child.id} className="item-row" style={{ paddingLeft: '2rem' }}>
                        <div className="item-info">
                          <span style={{ marginRight: '0.5rem' }}>›</span>
                          <span className="item-name">{child.name}</span>
                          {child.notes && <div className="item-details">{child.notes}</div>}
                        </div>
                        <div className="item-cost">{child.realCost ?? child.baseCost ?? 0}</div>
                        <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          {/* Move to group menu */}
                          {(availableGroups.length > 0 || child.parentId) && (
                            <div data-move-menu style={{ position: 'relative' }}>
                              <button
                                className="btn-icon-small"
                                onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === child.id ? null : child.id)}
                                title="Move to group"
                                style={{ 
                                  background: moveMenuOpenFor === child.id ? 'var(--surface)' : undefined,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                              >
                                <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
                              </button>
                              {moveMenuOpenFor === child.id && (
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
                                  {child.parentId && (
                                    <div
                                      style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                                      onClick={() => handleMoveToGroup(child.id, null)}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                                    >
                                      — None —
                                    </div>
                                  )}
                                  {availableGroups.filter(g => g.id !== child.parentId).map(group => (
                                    <div
                                      key={group.id}
                                      style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                                      onClick={() => handleMoveToGroup(child.id, group.id)}
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
                            onClick={() => openEditModal(child)}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon-small"
                            onClick={() => handleDelete(child.id)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Render standalone perk
            const availableGroups = getAvailableGroups(perk);
            return (
              <div key={perk.id} className="item-row">
                <div className="item-info">
                  <div className="item-name">{perk.name}</div>
                  {perk.notes && <div className="item-details">{perk.notes}</div>}
                </div>
                <div className="item-cost">{perk.realCost ?? perk.baseCost ?? 0}</div>
                <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  {/* Move to group menu */}
                  {(availableGroups.length > 0 || perk.parentId) && (
                    <div data-move-menu style={{ position: 'relative' }}>
                      <button
                        className="btn-icon-small"
                        onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === perk.id ? null : perk.id)}
                        title="Move to group"
                        style={{ 
                          background: moveMenuOpenFor === perk.id ? 'var(--surface)' : undefined,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
                      </button>
                      {moveMenuOpenFor === perk.id && (
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
                          {perk.parentId && (
                            <div
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                              onClick={() => handleMoveToGroup(perk.id, null)}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                            >
                              — None —
                            </div>
                          )}
                          {availableGroups.filter(g => g.id !== perk.parentId).map(group => (
                            <div
                              key={group.id}
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                              onClick={() => handleMoveToGroup(perk.id, group.id)}
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
            );
          })}
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

      {/* Add/Edit Group Modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        title={editingGroup ? 'Edit Perk Group' : 'Add Perk Group'}
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
            placeholder="e.g., Street Contacts, Guild Memberships"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cost Discount (per perk)</label>
          <input
            type="number"
            className="form-input"
            value={groupFormData.discountAdder}
            onChange={(e) => setGroupFormData({ ...groupFormData, discountAdder: parseInt(e.target.value) || 0 })}
            max={0}
          />
          <small style={{ color: 'var(--text-secondary)' }}>
            Enter a negative number (e.g., -1) to discount each perk in this group
          </small>
        </div>
      </Modal>
    </div>
  );
}
