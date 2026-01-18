import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Character, MartialManeuver, Adder } from '@hero-workshop/shared';
import { Modal } from './Modal';

interface MartialArtsTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Common martial maneuvers from HERO System 6E
const COMMON_MANEUVERS = [
  { name: 'Block', phase: '1/2', ocv: '+0', dcv: '+0', dc: 0, effect: 'Block, Abort', baseCost: 4 },
  { name: 'Disarm', phase: '1/2', ocv: '-2', dcv: '+0', dc: 0, effect: 'Disarm, STR vs STR', baseCost: 4 },
  { name: 'Dodge', phase: '1/2', ocv: '--', dcv: '+3', dc: 0, effect: 'Abort, vs. all attacks', baseCost: 4 },
  { name: 'Escape', phase: '1/2', ocv: '+0', dcv: '+0', dc: 0, effect: '+15 STR vs. Grabs', baseCost: 4 },
  { name: 'Fast Strike', phase: '1/2', ocv: '+2', dcv: '+0', dc: 2, effect: 'STR +2d6 Strike', baseCost: 4 },
  { name: 'Flying Dodge', phase: '1/2', ocv: '--', dcv: '+4', dc: 0, effect: 'Abort, FMove', baseCost: 5 },
  { name: 'Flying Grab', phase: '1/2', ocv: '-2', dcv: '-1', dc: 0, effect: 'Grab, FMove', baseCost: 4 },
  { name: 'Grab', phase: '1/2', ocv: '-1', dcv: '-2', dc: 0, effect: 'Grab, +10 STR for holding', baseCost: 3 },
  { name: 'Kick', phase: '1/2', ocv: '-2', dcv: '+1', dc: 4, effect: 'STR +4d6 Strike', baseCost: 5 },
  { name: 'Killing Strike', phase: '1/2', ocv: '-2', dcv: '+0', dc: 0, effect: '1/2 STR HKA', baseCost: 4 },
  { name: 'Legsweep', phase: '1/2', ocv: '+2', dcv: '-1', dc: 1, effect: 'STR +1d6 Strike, Target Falls', baseCost: 3 },
  { name: 'Martial Throw', phase: '1/2', ocv: '+0', dcv: '+2', dc: 2, effect: 'STR +2d6 Strike, Target Falls', baseCost: 3 },
  { name: 'Nerve Strike', phase: '1/2', ocv: '-1', dcv: '+1', dc: 2, effect: '2d6 NND', baseCost: 4 },
  { name: 'Offensive Strike', phase: '1/2', ocv: '-2', dcv: '+1', dc: 4, effect: 'STR +4d6 Strike', baseCost: 5 },
  { name: 'Passing Strike', phase: '1/2', ocv: '+1', dcv: '+0', dc: 2, effect: 'STR +2d6 Strike, FMove', baseCost: 5 },
  { name: 'Sacrifice Throw', phase: '1/2', ocv: '+2', dcv: '+1', dc: 0, effect: 'STR Strike, Both Fall', baseCost: 3 },
  { name: 'Strike', phase: '1/2', ocv: '+0', dcv: '+2', dc: 2, effect: 'STR +2d6 Strike', baseCost: 4 },
];

// Weapon Element categories and weapons from HERO System 6E
interface WeaponCategory {
  id: string;
  name: string;
  type: 'HTH' | 'RANGED';
  weapons: { id: string; name: string }[];
}

const WEAPON_CATEGORIES: WeaponCategory[] = [
  {
    id: 'BAREHAND',
    name: 'Empty Hand',
    type: 'HTH',
    weapons: []
  },
  {
    id: 'COMMONMELEE',
    name: 'Common Melee Weapons',
    type: 'HTH',
    weapons: [
      { id: 'AXESMACES', name: 'Axes, Maces, Hammers, and Picks' },
      { id: 'BLADES', name: 'Blades' },
      { id: 'CLUBS', name: 'Clubs' },
      { id: 'FISTLOADS', name: 'Fist-Loads' },
      { id: 'POLEARMS', name: 'Polearms and Spears' },
      { id: 'TWOHANDED', name: 'Two-Handed Weapons' },
    ]
  },
  {
    id: 'UNCOMMONMELEE',
    name: 'Uncommon Melee Weapons',
    type: 'HTH',
    weapons: [
      { id: 'FLAILS', name: 'Flails' },
      { id: 'GARROTE', name: 'Garrote' },
      { id: 'HOMEMADEWEAPONS', name: 'Homemade Weapons' },
      { id: 'LANCES', name: 'Lances' },
      { id: 'NETS', name: 'Nets' },
      { id: 'SPREADTHEWATER', name: 'Spread-The-Water Knife' },
      { id: 'STAFFS', name: 'Staffs' },
      { id: 'WHIPS', name: 'Whips' },
      { id: 'ELECTRICWHIP', name: 'Electric Whip' },
      { id: 'ENERGYBLADES', name: 'Energy Blades' },
      { id: 'INERTIALGLOVES', name: 'Inertial Gloves' },
      { id: 'STUNRODS', name: 'Stun Rods' },
    ]
  },
  {
    id: 'COMMONMARTIAL',
    name: 'Common Martial Arts Melee Weapons',
    type: 'HTH',
    weapons: [
      { id: 'CHAIN', name: 'Chain & Rope Weapons' },
      { id: 'KARATE', name: 'Karate Weapons' },
      { id: 'MOURN', name: 'Mourn Staff' },
      { id: 'NINJA', name: 'Ninja Weapons' },
      { id: 'RINGS', name: 'Rings' },
      { id: 'STAFFS', name: 'Staffs' },
      { id: 'WARFAN', name: 'War Fan' },
    ]
  },
  {
    id: 'UNCOMMONMARTIAL',
    name: 'Uncommon Martial Arts Melee Weapons',
    type: 'HTH',
    weapons: [
      { id: 'FLYINGCLAW', name: 'Flying Claw/Guillotine' },
      { id: 'HOOKSWORD', name: 'Hook Sword' },
      { id: 'KISERU', name: 'Kiseru' },
      { id: 'LAJATANG', name: 'Lajatang' },
      { id: 'PENDJEPIT', name: 'Pendjepit' },
      { id: 'ROPEDART', name: 'Rope Dart' },
      { id: 'THREESECTIONSTAFF', name: 'Three-Section Staff' },
      { id: 'URUMI', name: 'Urumi' },
      { id: 'WINDANDFIRE', name: 'Wind and Fire Wheels' },
    ]
  },
  {
    id: 'COMMONMISSILE',
    name: 'Common Missile Weapons',
    type: 'RANGED',
    weapons: [
      { id: 'ROCKS', name: 'Thrown Rocks' },
      { id: 'BOWS', name: 'Bows' },
      { id: 'CROSSBOWS', name: 'Crossbows' },
      { id: 'JAVELINS', name: 'Javelins and Thrown Spears' },
      { id: 'THROWNKNIVES', name: 'Thrown Knives, Axes, and Darts' },
    ]
  },
  {
    id: 'UNCOMMONMISSILEWEAPONS',
    name: 'Uncommon Missile Weapons',
    type: 'RANGED',
    weapons: [
      { id: 'ARARE', name: 'Arare' },
      { id: 'ATATL', name: 'Atatl' },
      { id: 'BLOWGUNS', name: 'Blowguns' },
      { id: 'BOOMERANGS', name: 'Boomerangs and Throwing Clubs' },
      { id: 'EARLYGRENADES', name: 'Early Thrown Grenades' },
      { id: 'FUKIMIBARI', name: 'Fukimi-Bari' },
      { id: 'IRONDUCK', name: 'Iron Mandarin Duck' },
      { id: 'METSUBISHI', name: 'Metsubishi' },
      { id: 'SLING', name: 'Sling' },
      { id: 'SLINGBOW', name: 'Sling Bow' },
      { id: 'STAFFSLING', name: 'Staff Sling' },
      { id: 'STEELOLIVE', name: 'Steel Olive' },
      { id: 'STEELTOAD', name: 'Steel Toad' },
      { id: 'THROWNCHAIN', name: 'Thrown Chain & Rope Weapons' },
      { id: 'THROWNSWORD', name: 'Thrown Sword' },
      { id: 'WISHFULBALL', name: 'Wishful Steel Ball' },
    ]
  },
  {
    id: 'SMALLARMS',
    name: 'Small Arms',
    type: 'RANGED',
    weapons: [
      { id: 'LMGS', name: 'Assault Rifles/LMGs' },
      { id: 'HANDGUNS', name: 'Handguns' },
      { id: 'RIFLES', name: 'Rifles' },
      { id: 'SHOTGUNS', name: 'Shotguns' },
      { id: 'SUBMACHINEGUNS', name: 'Submachine Guns' },
      { id: 'THROWNGRENADES', name: 'Thrown Grenades' },
      { id: 'LIQUIDRIFLE', name: 'Liquid-Propellant Rifles' },
      { id: 'GAUSSGUNS', name: 'Gauss Guns' },
      { id: 'POLYMERGUNS', name: 'Polymer Guns' },
      { id: 'ROCKETPISTOLS', name: 'Rocket Pistols' },
      { id: 'ROCKETRIFLES', name: 'Rocket Rifles' },
      { id: 'MISSILEGUNS', name: 'Missile Guns' },
      { id: 'SONICSTUNNER', name: 'Sonic Stunners' },
      { id: 'TRANQGUNS', name: 'Tranquilizer Dart Guns' },
    ]
  },
  {
    id: 'BEAMWEAPONS',
    name: 'Beam Weapons',
    type: 'RANGED',
    weapons: [
      { id: 'LASERPISTOL', name: 'Laser Pistols' },
      { id: 'LASERRIFLE', name: 'Laser Rifles' },
      { id: 'ELECTRONBEAM', name: 'Electron Beam Weapons' },
      { id: 'PARTICLEGUNS', name: 'Particle Guns' },
    ]
  },
  {
    id: 'ENERGYWEAPONS',
    name: 'Energy Weapons',
    type: 'RANGED',
    weapons: [
      { id: 'IONBLASTER', name: 'Ion Blasters' },
      { id: 'PLASMAGUNS', name: 'Plasma Guns' },
      { id: 'DISINTEGRATORS', name: 'Disintegrators' },
    ]
  },
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function parseOcvDcv(value: string): number {
  if (value === '--') return 0;
  return parseInt(value.replace('+', ''), 10) || 0;
}

/** Represents a martial arts entry that might be a group with children */
interface MartialDisplayItem {
  item: MartialManeuver;
  children: MartialManeuver[];
}

export function MartialArtsTab({ character, onUpdate }: MartialArtsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isWeaponModalOpen, setIsWeaponModalOpen] = useState(false);
  const [editingManeuver, setEditingManeuver] = useState<MartialManeuver | null>(null);
  const [editingGroup, setEditingGroup] = useState<MartialManeuver | null>(null);
  const [editingWeaponElement, setEditingWeaponElement] = useState<MartialManeuver | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [moveMenuOpenFor, setMoveMenuOpenFor] = useState<string | null>(null);
  const [selectedCommon, setSelectedCommon] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    phase: '1/2',
    ocv: 0,
    dcv: 0,
    dc: 0,
    effect: '',
    baseCost: 4,
  });
  const [groupFormData, setGroupFormData] = useState({
    name: '',
  });
  // Weapon element form: selected weapons by category
  const [weaponFormData, setWeaponFormData] = useState<{
    alias: string;
    selectedWeapons: Map<string, Set<string>>; // categoryId -> Set of weaponIds
  }>({
    alias: '',
    selectedWeapons: new Map(),
  });

  const maneuvers = useMemo(() => character.martialArts ?? [], [character.martialArts]);

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

  // Get available groups (styles) for moving an item
  const getAvailableGroups = (item: MartialManeuver): MartialManeuver[] => {
    return maneuvers.filter(m => m.isGroup && m.id !== item.id);
  };

  // Move an item to a group (or remove from group)
  const handleMoveToGroup = (itemId: string, parentId: string | null) => {
    const updatedManeuvers = maneuvers.map(m => {
      if (m.id === itemId) {
        return {
          ...m,
          parentId: parentId ?? undefined,
        };
      }
      return m;
    });
    
    onUpdate({ ...character, martialArts: updatedManeuvers });
    setMoveMenuOpenFor(null);
  };
  
  // Calculate total cost (only count non-group items)
  const totalCost = maneuvers.reduce((sum, m) => {
    if (m.isGroup) return sum;
    return sum + (m.realCost ?? m.baseCost ?? 0);
  }, 0);

  // Organize maneuvers into a hierarchical display structure
  const displayItems = useMemo(() => {
    const items: MartialDisplayItem[] = [];
    const childrenMap = new Map<string, MartialManeuver[]>();
    
    // First pass: identify parents
    for (const item of maneuvers) {
      if (item.isGroup) {
        childrenMap.set(item.id, []);
      }
    }
    
    // Second pass: assign children to parents
    for (const item of maneuvers) {
      if (!item.isGroup && item.parentId) {
        const children = childrenMap.get(item.parentId);
        if (children) {
          children.push(item);
        }
      }
    }
    
    // Build display items
    for (const item of maneuvers) {
      if (item.isGroup) {
        items.push({
          item,
          children: childrenMap.get(item.id) || [],
        });
      } else if (!item.parentId) {
        items.push({
          item,
          children: [],
        });
      }
    }
    
    return items;
  }, [maneuvers]);

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

  const openAddModal = () => {
    setEditingManeuver(null);
    setSelectedCommon('');
    setFormData({
      name: '',
      alias: '',
      notes: '',
      phase: '1/2',
      ocv: 0,
      dcv: 0,
      dc: 0,
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
      phase: maneuver.phase ?? '1/2',
      ocv: maneuver.ocv,
      dcv: maneuver.dcv,
      dc: maneuver.dc ?? 0,
      effect: maneuver.effect ?? '',
      baseCost: maneuver.baseCost,
    });
    setIsModalOpen(true);
  };

  const openAddGroupModal = () => {
    setEditingGroup(null);
    setGroupFormData({ name: '' });
    setIsGroupModalOpen(true);
  };

  const openEditGroupModal = (group: MartialManeuver) => {
    setEditingGroup(group);
    setGroupFormData({
      name: group.name,
    });
    setIsGroupModalOpen(true);
  };

  const openAddWeaponModal = () => {
    setEditingWeaponElement(null);
    setWeaponFormData({
      alias: '',
      selectedWeapons: new Map(),
    });
    setIsWeaponModalOpen(true);
  };

  const openEditWeaponModal = (weaponElement: MartialManeuver) => {
    setEditingWeaponElement(weaponElement);
    
    // Parse existing adders to populate selected weapons
    // Use xmlId to match against WEAPON_CATEGORIES since id is the instance ID
    const selected = new Map<string, Set<string>>();
    if (weaponElement.adders) {
      for (const categoryAdder of weaponElement.adders) {
        const categoryXmlId = categoryAdder.xmlId || categoryAdder.name;
        if (!categoryXmlId) continue;
        
        const weaponSet = new Set<string>();
        // Check if category itself is selected (for single-item categories like BAREHAND)
        if (categoryAdder.selected) {
          weaponSet.add(categoryXmlId);
        }
        // Check nested weapon adders
        if (categoryAdder.adders) {
          for (const weaponAdder of categoryAdder.adders) {
            if (weaponAdder.selected) {
              const weaponXmlId = weaponAdder.xmlId || weaponAdder.name;
              if (weaponXmlId) {
                weaponSet.add(weaponXmlId);
              }
            }
          }
        }
        if (weaponSet.size > 0) {
          selected.set(categoryXmlId, weaponSet);
        }
      }
    }
    
    setWeaponFormData({
      alias: weaponElement.alias || 'Weapon Element',
      selectedWeapons: selected,
    });
    setIsWeaponModalOpen(true);
  };

  const handleCommonSelect = (name: string) => {
    setSelectedCommon(name);
    const maneuver = COMMON_MANEUVERS.find((m) => m.name === name);
    if (maneuver) {
      setFormData({
        ...formData,
        name: maneuver.name,
        phase: maneuver.phase,
        ocv: parseOcvDcv(maneuver.ocv),
        dcv: parseOcvDcv(maneuver.dcv),
        dc: maneuver.dc,
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
      phase: formData.phase || '1/2',
      ocv: formData.ocv,
      dcv: formData.dcv,
      dc: formData.dc || undefined,
      effect: formData.effect || undefined,
      parentId: editingManeuver?.parentId,
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

  const handleSaveGroup = () => {
    if (editingGroup) {
      const updatedManeuvers = maneuvers.map(m => {
        if (m.id === editingGroup.id) {
          return {
            ...m,
            name: groupFormData.name || 'Martial Arts Style',
          };
        }
        return m;
      });
      onUpdate({ ...character, martialArts: updatedManeuvers });
    } else {
      const newGroup: MartialManeuver = {
        id: generateId(),
        name: groupFormData.name || 'Martial Arts Style',
        baseCost: 0,
        realCost: 0,
        levels: 0,
        position: maneuvers.length,
        ocv: 0,
        dcv: 0,
        isGroup: true,
      };
      onUpdate({ ...character, martialArts: [...maneuvers, newGroup] });
    }
    setIsGroupModalOpen(false);
    setEditingGroup(null);
  };

  const handleSaveWeaponElement = () => {
    // Build adders from selected weapons
    const adders: Adder[] = [];
    let totalCost = 0;
    
    for (const category of WEAPON_CATEGORIES) {
      const selectedInCategory = weaponFormData.selectedWeapons.get(category.id);
      if (!selectedInCategory || selectedInCategory.size === 0) continue;
      
      if (category.weapons.length === 0) {
        // Single item category (like Empty Hand)
        totalCost += 1;
        adders.push({
          id: generateId(),
          name: category.name,
          alias: category.name,
          baseCost: 1,
          levels: 0,
          selected: true,
        });
      } else {
        // Category with weapons
        const weaponAdders: Adder[] = [];
        for (const weapon of category.weapons) {
          if (selectedInCategory.has(weapon.id)) {
            totalCost += 1;
            weaponAdders.push({
              id: generateId(),
              name: weapon.id,
              alias: weapon.name,
              baseCost: 1,
              levels: 0,
              selected: true,
            });
          }
        }
        if (weaponAdders.length > 0) {
          adders.push({
            id: generateId(),
            name: category.id,
            alias: category.name,
            baseCost: 0,
            levels: 0,
            adders: weaponAdders,
          });
        }
      }
    }

    // Build display alias from selected weapons
    const selectedNames: string[] = [];
    for (const category of WEAPON_CATEGORIES) {
      const sel = weaponFormData.selectedWeapons.get(category.id);
      if (!sel) continue;
      if (category.weapons.length === 0 && sel.size > 0) {
        selectedNames.push(category.name);
      } else {
        for (const weapon of category.weapons) {
          if (sel.has(weapon.id)) {
            selectedNames.push(weapon.name);
          }
        }
      }
    }
    const alias = weaponFormData.alias || 'Weapon Element: ' + selectedNames.join(', ');

    if (editingWeaponElement) {
      const updatedManeuvers = maneuvers.map(m => {
        if (m.id === editingWeaponElement.id) {
          return {
            ...m,
            alias,
            baseCost: totalCost,
            realCost: totalCost,
            adders,
          };
        }
        return m;
      });
      onUpdate({ ...character, martialArts: updatedManeuvers });
    } else {
      const newWeaponElement: MartialManeuver = {
        id: generateId(),
        name: 'WEAPON_ELEMENT',
        alias,
        baseCost: totalCost,
        realCost: totalCost,
        levels: 0,
        position: maneuvers.length,
        ocv: 0,
        dcv: 0,
        isWeaponElement: true,
        adders,
      };
      onUpdate({ ...character, martialArts: [...maneuvers, newWeaponElement] });
    }
    setIsWeaponModalOpen(false);
    setEditingWeaponElement(null);
  };

  const toggleWeaponSelection = (categoryId: string, weaponId: string) => {
    setWeaponFormData(prev => {
      const newSelected = new Map(prev.selectedWeapons);
      const categorySet = new Set(newSelected.get(categoryId) ?? []);
      
      if (categorySet.has(weaponId)) {
        categorySet.delete(weaponId);
      } else {
        categorySet.add(weaponId);
      }
      
      if (categorySet.size === 0) {
        newSelected.delete(categoryId);
      } else {
        newSelected.set(categoryId, categorySet);
      }
      
      return { ...prev, selectedWeapons: newSelected };
    });
  };

  const handleDelete = (id: string) => {
    onUpdate({
      ...character,
      martialArts: maneuvers.filter((m) => m.id !== id),
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const updatedManeuvers = maneuvers
      .filter(m => m.id !== groupId)
      .map(m => {
        if (m.parentId === groupId) {
          return { ...m, parentId: undefined };
        }
        return m;
      });
    onUpdate({ ...character, martialArts: updatedManeuvers });
  };

  const formatOcvDcv = (value: number): string => {
    if (value === 0) return '+0';
    return value > 0 ? `+${value}` : `${value}`;
  };

  if (maneuvers.length === 0 && !isModalOpen && !isGroupModalOpen && !isWeaponModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🥋</div>
        <div className="empty-state-title">No Martial Arts</div>
        <p>This character has no martial maneuvers.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={openAddGroupModal}>
            Add Style
          </button>
          <button className="btn btn-secondary" onClick={openAddWeaponModal}>
            Add Weapon Element
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Maneuver
          </button>
        </div>
      </div>
    );
  }

  const renderManeuverRow = (maneuver: MartialManeuver, indent: boolean = false) => {
    const availableGroups = getAvailableGroups(maneuver);
    
    // Move menu component (reused for weapon elements and regular maneuvers)
    const moveMenu = (availableGroups.length > 0 || maneuver.parentId) && (
      <div data-move-menu style={{ position: 'relative', display: 'inline-block' }}>
        <button
          className="btn-icon-small"
          onClick={(e) => {
            e.stopPropagation();
            setMoveMenuOpenFor(moveMenuOpenFor === maneuver.id ? null : maneuver.id);
          }}
          title="Move to style"
          style={{ 
            background: moveMenuOpenFor === maneuver.id ? 'var(--surface)' : undefined,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px'
          }}
        >
          <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
        </button>
        {moveMenuOpenFor === maneuver.id && (
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
            {maneuver.parentId && (
              <div
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); handleMoveToGroup(maneuver.id, null); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                — None —
              </div>
            )}
            {availableGroups.filter(g => g.id !== maneuver.parentId).map(group => (
              <div
                key={group.id}
                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); handleMoveToGroup(maneuver.id, group.id); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                {group.name}
              </div>
            ))}
          </div>
        )}
      </div>
    );

    if (maneuver.isWeaponElement) {
      // Build list of selected weapons from adders
      const selectedWeaponNames: string[] = [];
      if (maneuver.adders) {
        for (const categoryAdder of maneuver.adders) {
          const categoryXmlId = categoryAdder.xmlId || categoryAdder.name;
          const category = WEAPON_CATEGORIES.find(c => c.id === categoryXmlId);
          
          if (category && category.weapons.length === 0 && categoryAdder.selected) {
            // Single-item category like Empty Hand
            selectedWeaponNames.push(category.name);
          } else if (categoryAdder.adders) {
            // Category with nested weapons
            for (const weaponAdder of categoryAdder.adders) {
              if (weaponAdder.selected) {
                selectedWeaponNames.push(weaponAdder.alias || weaponAdder.name);
              }
            }
          }
        }
      }
      const weaponList = selectedWeaponNames.length > 0 ? selectedWeaponNames.join(', ') : '(none selected)';
      
      // Weapon Element row
      return (
        <tr key={maneuver.id}>
          <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
            <div style={{ fontWeight: 500 }}>
              {indent && <span style={{ marginRight: '0.5rem' }}>›</span>}
              ⚔️ Weapon Element
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {weaponList}
            </div>
          </td>
          <td style={{ textAlign: 'center' }}>—</td>
          <td style={{ textAlign: 'center' }}>—</td>
          <td style={{ textAlign: 'center' }}>—</td>
          <td style={{ textAlign: 'center' }}>—</td>
          <td style={{ fontSize: '0.875rem' }}>Use martial maneuvers with weapons</td>
          <td style={{ textAlign: 'right' }}>{maneuver.realCost ?? maneuver.baseCost ?? 0}</td>
          <td>
            <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              {moveMenu}
              <button
                className="btn-icon-small"
                onClick={() => openEditWeaponModal(maneuver)}
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
      );
    }
    
    // Regular maneuver row
    return (
      <tr key={maneuver.id}>
        <td style={{ paddingLeft: indent ? '2rem' : undefined }}>
          <div style={{ fontWeight: 500 }}>
            {indent && <span style={{ marginRight: '0.5rem' }}>›</span>}
            {maneuver.name}
          </div>
          {maneuver.notes && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {maneuver.notes}
            </div>
          )}
        </td>
        <td style={{ textAlign: 'center' }}>{maneuver.phase ?? '1/2'}</td>
        <td style={{ textAlign: 'center' }}>{formatOcvDcv(maneuver.ocv)}</td>
        <td style={{ textAlign: 'center' }}>{formatOcvDcv(maneuver.dcv)}</td>
        <td style={{ textAlign: 'center' }}>{maneuver.dc ?? '—'}</td>
        <td style={{ fontSize: '0.875rem' }}>{maneuver.effect ?? '—'}</td>
        <td style={{ textAlign: 'right' }}>{maneuver.realCost ?? maneuver.baseCost ?? 0}</td>
        <td>
          <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            {moveMenu}
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
    );
  };

  return (
    <div className="martial-arts-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Martial Arts ({totalCost} pts)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={openAddGroupModal}>Add Style</button>
            <button className="btn btn-secondary" onClick={openAddWeaponModal}>Add Weapon Element</button>
            <button className="btn btn-primary" onClick={openAddModal}>Add Maneuver</button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Maneuver</th>
              <th style={{ textAlign: 'center', width: '60px' }}>Phase</th>
              <th style={{ textAlign: 'center', width: '50px' }}>OCV</th>
              <th style={{ textAlign: 'center', width: '50px' }}>DCV</th>
              <th style={{ textAlign: 'center', width: '50px' }}>DC</th>
              <th>Effect</th>
              <th style={{ textAlign: 'right', width: '50px' }}>Cost</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((displayItem) => {
              const { item, children } = displayItem;
              const isCollapsed = collapsedGroups.has(item.id);
              
              if (item.isGroup) {
                // Render group header
                const groupTotal = children.reduce((sum, c) => sum + (c.realCost ?? c.baseCost ?? 0), 0);
                return (
                  <React.Fragment key={item.id}>
                    <tr 
                      className="group-header"
                      onClick={() => toggleGroup(item.id)}
                      style={{ cursor: 'pointer', backgroundColor: 'var(--bg-secondary)' }}
                    >
                      <td colSpan={6}>
                        <span style={{ marginRight: '0.5rem' }}>{isCollapsed ? '▶' : '▼'}</span>
                        <strong>{item.name}</strong>
                        <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                          ({children.length} items)
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{groupTotal}</td>
                      <td>
                        <div className="item-actions">
                          <button
                            className="btn-icon-small"
                            onClick={(e) => { e.stopPropagation(); openEditGroupModal(item); }}
                            title="Edit Style"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-icon-small"
                            onClick={(e) => { e.stopPropagation(); handleDeleteGroup(item.id); }}
                            title="Delete Style"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && children.map(child => renderManeuverRow(child, true))}
                  </React.Fragment>
                );
              }
              
              // Render standalone maneuver
              return renderManeuverRow(item);
            })}
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
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Phase</label>
            <select
              className="form-select"
              value={formData.phase}
              onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
            >
              <option value="0">0 (Free)</option>
              <option value="1/2">1/2 Phase</option>
              <option value="1">1 Phase</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">DC (Damage Class)</label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={formData.dc}
              onChange={(e) => setFormData({ ...formData, dc: parseInt(e.target.value, 10) || 0 })}
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

      {/* Group/Style Modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        title={editingGroup ? 'Edit Martial Arts Style' : 'Add Martial Arts Style'}
      >
        <div className="form-group">
          <label className="form-label">Style Name</label>
          <input
            type="text"
            className="form-input"
            value={groupFormData.name}
            onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
            placeholder="e.g., Karate, Kung Fu, Kenjutsu..."
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setIsGroupModalOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveGroup}>
            {editingGroup ? 'Update' : 'Add'} Style
          </button>
        </div>
      </Modal>

      {/* Weapon Element Modal */}
      <Modal
        isOpen={isWeaponModalOpen}
        onClose={() => setIsWeaponModalOpen(false)}
        title={editingWeaponElement ? 'Edit Weapon Element' : 'Add Weapon Element'}
      >
        <div className="form-group">
          <label className="form-label">Display Name</label>
          <input
            type="text"
            className="form-input"
            value={weaponFormData.alias}
            onChange={(e) => setWeaponFormData({ ...weaponFormData, alias: e.target.value })}
            placeholder="e.g., Claws, Blades, etc."
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">Select Weapons (1 pt each)</label>
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem' }}>
            {WEAPON_CATEGORIES.map(category => {
              const selectedInCategory = weaponFormData.selectedWeapons.get(category.id);
              
              if (category.weapons.length === 0) {
                // Single item category
                const isSelected = selectedInCategory?.has(category.id) ?? false;
                return (
                  <div key={category.id} style={{ marginBottom: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWeaponSelection(category.id, category.id)}
                      />
                      <span>{category.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({category.type})</span>
                    </label>
                  </div>
                );
              }
              
              return (
                <div key={category.id} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                    {category.name}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({category.type})</span>
                  </div>
                  <div style={{ paddingLeft: '1rem' }}>
                    {category.weapons.map(weapon => {
                      const isSelected = selectedInCategory?.has(weapon.id) ?? false;
                      return (
                        <label key={weapon.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.125rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleWeaponSelection(category.id, weapon.id)}
                          />
                          <span>{weapon.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
          <strong>Total Cost:</strong> {
            Array.from(weaponFormData.selectedWeapons.values()).reduce((sum, set) => sum + set.size, 0)
          } pts
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setIsWeaponModalOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveWeaponElement}>
            {editingWeaponElement ? 'Update' : 'Add'} Weapon Element
          </button>
        </div>
      </Modal>
    </div>
  );
}
