import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Character, Power, Modifier, Adder } from '@hero-workshop/shared';
import {
  ALL_POWERS,
  getPowerDefinition,
  calculatePowerBaseCost,
  calculateAdderCost,
  type PowerDefinition,
  type PowerAdder,
} from '@hero-workshop/shared';
import {
  ADVANTAGES,
  LIMITATIONS,
  formatModifierValue,
  type ModifierDefinition,
} from '@hero-workshop/shared';
import { Modal } from './Modal';

interface PowersTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Group powers by category for the dropdown
const POWER_CATEGORIES: Record<string, PowerDefinition[]> = {
  'Attack Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('ATTACK')),
  'Defensive Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('DEFENSE')),
  'Movement Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('MOVEMENT')),
  'Mental Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('MENTAL')),
  'Body-Affecting Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('BODYAFFECTING') || p.types.includes('SIZE')),
  'Sensory Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('SENSORY') || p.types.includes('SENSEAFFECTING')),
  'Adjustment Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('ADJUSTMENT')),
  'Special Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('SPECIAL') && !p.types.includes('ATTACK')),
  'Standard Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => p.types.includes('STANDARD') && p.types.length === 1),
};

// Convert ADVANTAGES and LIMITATIONS to arrays for easier rendering
const ALL_ADVANTAGES: ModifierDefinition[] = Object.values(ADVANTAGES).sort((a: ModifierDefinition, b: ModifierDefinition) => a.display.localeCompare(b.display));
const ALL_LIMITATIONS: ModifierDefinition[] = Object.values(LIMITATIONS).sort((a: ModifierDefinition, b: ModifierDefinition) => a.display.localeCompare(b.display));

interface SelectedModifier {
  xmlId: string;
  name: string;
  value: number;
  isAdvantage: boolean;
  isLimitation: boolean;
  levels?: number;
  optionId?: string;
  optionName?: string;
  notes?: string;
  adders?: Adder[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Calculate STR damage in dice notation
 * From Strength.java: STR / 5 = d6 of HTH damage
 */
function calculateStrDamage(str: number): string {
  const fullDice = Math.floor(str / 5);
  const remainder = str % 5;
  
  if (remainder === 0) {
    return `${fullDice}d6`;
  } else if (remainder === 1 || remainder === 2) {
    return fullDice > 0 ? `${fullDice}d6+${remainder}` : `+${remainder}`;
  } else if (remainder === 3) {
    return `${fullDice}½d6`;
  } else {
    // remainder === 4
    return `${fullDice + 1}d6-1`;
  }
}

/**
 * Calculate damage classes (DC) from dice
 * 1 DC = 1d6 normal or 1 pip killing
 */
function calculateDamageClasses(dice: number, isKilling: boolean): number {
  return isKilling ? dice * 3 : dice;
}

export function PowersTab({ character, onUpdate }: PowersTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPower, setEditingPower] = useState<Power | null>(null);
  const [isCompound, setIsCompound] = useState(false);
  const [expandedPowers, setExpandedPowers] = useState<Set<string>>(new Set());
  const [isEditingList, setIsEditingList] = useState(false);
  const [parentListId, setParentListId] = useState<string | null>(null);  // For adding power to a specific list
  
  // Form state
  const [selectedPowerDef, setSelectedPowerDef] = useState<PowerDefinition | null>(
    getPowerDefinition('ENERGYBLAST') ?? null
  );
  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    levels: 1,
    selectedModifiers: [] as SelectedModifier[],
    adders: [] as Adder[],
    discountAdder: 0, // For lists: -1, -2, etc. to discount child power costs
  });
  
  // Inherited modifiers from parent list (read-only)
  const [inheritedModifiers, setInheritedModifiers] = useState<Modifier[]>([]);
  
  // Child powers for compound power editing
  const [compoundChildPowers, setCompoundChildPowers] = useState<Power[]>([]);
  
  // Sub-power editing within compound power
  const [editingSubPower, setEditingSubPower] = useState<Power | null>(null);
  const [showSubPowerModal, setShowSubPowerModal] = useState(false);
  const [subPowerDef, setSubPowerDef] = useState<PowerDefinition | null>(null);
  const [subPowerFormData, setSubPowerFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    levels: 1,
    selectedModifiers: [] as SelectedModifier[],
  });
  
  // Modal for adding modifiers
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [modifierSearchTerm, setModifierSearchTerm] = useState('');
  const [modifierType, setModifierType] = useState<'advantage' | 'limitation' | 'custom'>('advantage');
  
  // Custom modifier form
  const [customModifier, setCustomModifier] = useState({
    name: '',
    value: 0.25,
    isAdvantage: true,
    notes: '',
  });
  
  // Modal for adding adders
  const [showAdderModal, setShowAdderModal] = useState(false);
  
  // Custom adder form
  const [showCustomAdder, setShowCustomAdder] = useState(false);
  const [customAdder, setCustomAdder] = useState({
    name: '',
    cost: 5,
    notes: '',
  });
  
  // Move to list popup menu
  const [moveMenuOpenFor, setMoveMenuOpenFor] = useState<string | null>(null);
  
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

  const powers = useMemo(() => character.powers ?? [], [character.powers]);
  // Build set of power IDs to check parent relationships
  const allPowerIds = useMemo(() => new Set(powers.map(p => p.id)), [powers]);
  
  const totalCost = useMemo(() => {
    return powers.reduce((sum, p) => {
      // Skip child powers - their cost is included in the parent container
      if (p.parentId && allPowerIds.has(p.parentId)) {
        return sum;
      }
      return sum + (p.realCost ?? p.baseCost ?? 0);
    }, 0);
  }, [powers, allPowerIds]);

  // Get all LIST containers
  const powerLists = useMemo(() => powers.filter(p => p.isContainer || p.type === 'LIST'), [powers]);
  
  // Get parent list for a power
  const getParentList = (power: Power): Power | undefined => {
    if (!power.parentId) return undefined;
    return powers.find(p => p.id === power.parentId && (p.isContainer || p.type === 'LIST'));
  };

  // Get character's STR for damage calculations
  const charStr = useMemo(() => {
    const strChar = character.characteristics?.find(c => c.type === 'STR');
    return strChar?.totalValue ?? strChar?.baseValue ?? 10;
  }, [character.characteristics]);

  const findPowerDefinition = (xmlId: string): PowerDefinition | undefined => {
    return getPowerDefinition(xmlId) ?? getPowerDefinition(xmlId.toUpperCase());
  };

  const matchPowerToDefinition = (power: Power): PowerDefinition | undefined => {
    // Try to match by type first (should be the XML ID)
    let def = findPowerDefinition(power.type);
    if (def) return def;
    
    // Try common mappings
    const typeMap: Record<string, string> = {
      'BLAST': 'ENERGYBLAST',
      'HAND_ATTACK': 'HANDTOHANDATTACK',
      'KILLING_ATTACK': 'KILLINGATTACK',
      'EGO_ATTACK': 'EGOATTACK',
      'RESISTANT_PROTECTION': 'FORCEFIELD',
      'FLASH_DEFENSE': 'FLASHDEFENSE',
      'MENTAL_DEFENSE': 'MENTALDEFENSE',
      'POWER_DEFENSE': 'POWERDEFENSE',
      'KNOCKBACK_RESISTANCE': 'KBRESISTANCE',
      'ENHANCED_SENSES': 'ENHANCEDSENSES',
      'DENSITY_INCREASE': 'DENSITYINCREASE',
      'EXTRA_LIMBS': 'EXTRALIMBS',
      'LIFE_SUPPORT': 'LIFESUPPORT',
      'ENDURANCE_RESERVE': 'ENDURANCERESERVE',
      'MIND_CONTROL': 'MINDCONTROL',
      'MIND_LINK': 'MINDLINK',
      'MIND_SCAN': 'MINDSCAN',
      'MENTAL_ILLUSIONS': 'MENTALILLUSIONS',
    };
    
    if (typeMap[power.type]) {
      const mappedType = typeMap[power.type];
      if (mappedType) {
        def = findPowerDefinition(mappedType);
        if (def) return def;
      }
    }
    
    // Try by name
    def = Object.values(ALL_POWERS).find(
      (p: PowerDefinition) => p.display.toLowerCase() === power.name.toLowerCase()
    );
    
    return def;
  };

  // Open modal to add a new power (optionally to a specific list)
  const openAddModal = (compound = false, toListId?: string) => {
    setEditingPower(null);
    setIsCompound(compound);
    setIsEditingList(false);
    setParentListId(toListId ?? null);
    setInheritedModifiers([]);
    setCompoundChildPowers([]);
    
    // If adding to a list, get the list's modifiers as inherited
    if (toListId) {
      const parentList = powers.find(p => p.id === toListId);
      if (parentList?.modifiers) {
        setInheritedModifiers(parentList.modifiers);
      }
    }
    
    if (compound) {
      // For compound power, don't pre-select a power type
      setSelectedPowerDef(null);
      setFormData({
        name: 'New Compound Power',
        alias: '',
        notes: '',
        levels: 0,
        selectedModifiers: [],
        adders: [],
        discountAdder: 0,
      });
    } else {
      const defaultPower = getPowerDefinition('ENERGYBLAST')!;
      setSelectedPowerDef(defaultPower);
      setFormData({
        name: defaultPower.display,
        alias: '',
        notes: '',
        levels: 1,
        selectedModifiers: [],
        adders: [],
        discountAdder: 0,
      });
    }
    setIsModalOpen(true);
  };

  // Open modal to add a new list
  const openAddListModal = () => {
    setEditingPower(null);
    setIsCompound(false);
    setIsEditingList(true);
    setParentListId(null);
    setInheritedModifiers([]);
    setSelectedPowerDef(null);
    setFormData({
      name: 'New Power List',
      alias: '',
      notes: '',
      levels: 0,
      selectedModifiers: [],
      adders: [],
      discountAdder: 0,
    });
    setCompoundChildPowers([]);
    setIsModalOpen(true);
  };

  const openEditModal = (power: Power) => {
    setEditingPower(power);
    setParentListId(power.parentId ?? null);
    
    // Check if editing a list container
    const isList = power.isContainer || power.type === 'LIST';
    setIsEditingList(isList);
    
    // Check if it's a compound power (COMPOUNDPOWER type or has child powers that aren't in a list)
    const isCompoundPower = power.type === 'COMPOUNDPOWER';
    const hasChildren = powers.some(p => p.parentId === power.id);
    setIsCompound(isCompoundPower || (hasChildren && !isList));
    
    // Load child powers for compound power editing
    if (isCompoundPower || hasChildren) {
      setCompoundChildPowers(powers.filter(p => p.parentId === power.id));
    } else {
      setCompoundChildPowers([]);
    }
    
    const def = matchPowerToDefinition(power);
    // If no definition found or it's a compound power, this is a custom/compound power - keep def as null
    setSelectedPowerDef(isCompoundPower ? null : (def ?? null));
    
    // Convert power modifiers to SelectedModifier format
    const selectedMods: SelectedModifier[] = (power.modifiers ?? []).map(mod => ({
      xmlId: mod.id,
      name: mod.name,
      value: mod.value,
      isAdvantage: mod.isAdvantage,
      isLimitation: mod.isLimitation,
      levels: mod.levels,
      notes: mod.notes,
      adders: mod.adders,
    }));
    
    // Get inherited modifiers from parent list (if any)
    if (!isList && power.parentId) {
      const parentList = powers.find(p => p.id === power.parentId);
      if (parentList?.modifiers) {
        setInheritedModifiers(parentList.modifiers);
      } else {
        setInheritedModifiers([]);
      }
    } else {
      setInheritedModifiers([]);
    }
    
    // Get discount adder from existing list adders
    const existingDiscount = (power.adders ?? []).find(a => a.baseCost < 0);
    
    setFormData({
      name: power.name,
      alias: power.alias ?? '',
      notes: power.notes ?? '',
      levels: power.levels ?? 1,
      selectedModifiers: selectedMods,
      adders: power.adders ?? [],
      discountAdder: existingDiscount?.baseCost ?? 0,
    });
    
    setIsModalOpen(true);
  };

  const handlePowerTypeChange = (xmlId: string) => {
    const def = getPowerDefinition(xmlId);
    if (def) {
      setSelectedPowerDef(def);
      setFormData({
        ...formData,
        name: def.display,
      });
    }
  };

  const addModifier = (modDef: typeof ADVANTAGES[string] | typeof LIMITATIONS[string]) => {
    const newMod: SelectedModifier = {
      xmlId: modDef.xmlId,
      name: modDef.display,
      value: modDef.baseCost,
      isAdvantage: modDef.isAdvantage,
      isLimitation: modDef.isLimitation,
      levels: modDef.hasLevels ? 1 : undefined,
    };
    
    setFormData({
      ...formData,
      selectedModifiers: [...formData.selectedModifiers, newMod],
    });
    setShowModifierModal(false);
  };

  const addCustomModifier = () => {
    if (!customModifier.name.trim()) return;
    
    const newMod: SelectedModifier = {
      xmlId: 'CUSTOM_' + generateId(),
      name: customModifier.name.trim(),
      value: customModifier.isAdvantage ? Math.abs(customModifier.value) : -Math.abs(customModifier.value),
      isAdvantage: customModifier.isAdvantage,
      isLimitation: !customModifier.isAdvantage,
      notes: customModifier.notes || undefined,
    };
    
    if (showSubPowerModal) {
      setSubPowerFormData({
        ...subPowerFormData,
        selectedModifiers: [...subPowerFormData.selectedModifiers, newMod],
      });
    } else {
      setFormData({
        ...formData,
        selectedModifiers: [...formData.selectedModifiers, newMod],
      });
    }
    
    // Reset form and close modal
    setCustomModifier({ name: '', value: 0.25, isAdvantage: true, notes: '' });
    setShowModifierModal(false);
  };

  const removeModifier = (index: number) => {
    setFormData({
      ...formData,
      selectedModifiers: formData.selectedModifiers.filter((_, i) => i !== index),
    });
  };

  // Adder management for powers
  const addAdder = (adderDef: PowerAdder) => {
    // Check if this adder is already added (use xmlId if available, else id)
    if (formData.adders.some(a => (a.xmlId || a.id) === adderDef.xmlId)) {
      return; // Already added
    }
    
    // Remove any adders that this one excludes (use xmlId if available, else id)
    let filteredAdders = formData.adders;
    if (adderDef.excludes && adderDef.excludes.length > 0) {
      filteredAdders = formData.adders.filter(a => !adderDef.excludes!.includes(a.xmlId || a.id));
    }
    
    const newAdder: Adder = {
      id: adderDef.xmlId,
      xmlId: adderDef.xmlId,
      name: adderDef.display,
      baseCost: adderDef.baseCost,
      levels: adderDef.lvlCost ? 1 : undefined,
      lvlCost: adderDef.lvlCost,
      lvlVal: adderDef.lvlVal,
      includeInBase: adderDef.includeInBase,
    };
    
    setFormData({
      ...formData,
      adders: [...filteredAdders, newAdder],
    });
    setShowAdderModal(false);
  };

  const addCustomAdder = () => {
    if (!customAdder.name.trim() || customAdder.cost <= 0) return;
    
    const newAdder: Adder = {
      id: 'CUSTOM_' + generateId(),
      xmlId: 'CUSTOM_' + generateId(),
      name: customAdder.name.trim(),
      baseCost: customAdder.cost,
      notes: customAdder.notes || undefined,
    };
    
    setFormData({
      ...formData,
      adders: [...formData.adders, newAdder],
    });
    
    // Reset form and close modal
    setCustomAdder({ name: '', cost: 5, notes: '' });
    setShowCustomAdder(false);
    setShowAdderModal(false);
  };

  const removeAdder = (index: number) => {
    setFormData({
      ...formData,
      adders: formData.adders.filter((_, i) => i !== index),
    });
  };

  const updateAdderLevels = (index: number, newLevels: number) => {
    const minLevels = 1;
    const actualLevels = Math.max(minLevels, newLevels);
    const updatedAdders = formData.adders.map((adder, i) => 
      i === index ? { ...adder, levels: actualLevels } : adder
    );
    setFormData({ ...formData, adders: updatedAdders });
  };

  // Get available adders for current power (excluding already-added ones)
  const availableAdders = useMemo(() => {
    if (!selectedPowerDef?.adders) return [];
    
    // Use xmlId if available, else id for matching
    const addedIds = new Set(formData.adders.map(a => a.xmlId || a.id));
    
    // Also check for exclusions - if an added adder excludes this one, don't show it
    const excludedIds = new Set<string>();
    for (const addedAdder of formData.adders) {
      const adderXmlId = addedAdder.xmlId || addedAdder.id;
      const adderDef = selectedPowerDef.adders.find(a => a.xmlId === adderXmlId);
      if (adderDef?.excludes) {
        adderDef.excludes.forEach(id => excludedIds.add(id));
      }
    }
    
    return selectedPowerDef.adders.filter(a => 
      !addedIds.has(a.xmlId) && !excludedIds.has(a.xmlId)
    );
  }, [selectedPowerDef, formData.adders]);

  // Sub-power management for compound powers
  const openAddSubPowerModal = () => {
    setEditingSubPower(null);
    const defaultPower = getPowerDefinition('ENERGYBLAST')!;
    setSubPowerDef(defaultPower);
    setSubPowerFormData({
      name: defaultPower.display,
      alias: '',
      notes: '',
      levels: 1,
      selectedModifiers: [],
    });
    setShowSubPowerModal(true);
  };

  const openEditSubPowerModal = (subPower: Power) => {
    setEditingSubPower(subPower);
    const def = matchPowerToDefinition(subPower);
    setSubPowerDef(def ?? null);
    
    const selectedMods: SelectedModifier[] = (subPower.modifiers ?? []).map(mod => ({
      xmlId: mod.id,
      name: mod.name,
      value: mod.value,
      isAdvantage: mod.isAdvantage,
      isLimitation: mod.isLimitation,
      levels: mod.levels,
      notes: mod.notes,
      adders: mod.adders,
    }));
    
    setSubPowerFormData({
      name: subPower.name,
      alias: subPower.alias ?? '',
      notes: subPower.notes ?? '',
      levels: subPower.levels ?? 1,
      selectedModifiers: selectedMods,
    });
    setShowSubPowerModal(true);
  };

  const saveSubPower = () => {
    if (!subPowerDef && !editingSubPower) return;
    
    // Calculate costs for the sub-power
    const baseCost = subPowerDef ? calculatePowerBaseCost(subPowerDef, subPowerFormData.levels) : 0;
    const advantages = subPowerFormData.selectedModifiers
      .filter(m => m.isAdvantage)
      .reduce((sum, m) => sum + m.value, 0);
    const activeCost = Math.floor(baseCost * (1 + advantages));
    const limitations = subPowerFormData.selectedModifiers
      .filter(m => m.isLimitation)
      .reduce((sum, m) => sum + Math.abs(m.value), 0);
    const realCost = limitations > 0 ? Math.floor(activeCost / (1 + limitations)) : activeCost;
    const endCost = subPowerDef?.usesEnd !== false ? Math.ceil(activeCost / 10) : 0;

    const modifiers: Modifier[] = subPowerFormData.selectedModifiers.map(mod => ({
      id: mod.xmlId,
      name: mod.name,
      alias: mod.optionName,
      value: mod.value,
      isAdvantage: mod.isAdvantage,
      isLimitation: mod.isLimitation,
      levels: mod.levels,
      notes: mod.notes,
      adders: mod.adders,
    }));

    const isCustomPower = !subPowerDef;
    const powerName = isCustomPower 
      ? (subPowerFormData.name || editingSubPower?.name || 'Custom Power')
      : (subPowerFormData.alias || subPowerDef.display);
    const powerType = isCustomPower
      ? (editingSubPower?.type ?? 'GENERIC')
      : subPowerDef.xmlId;

    const newSubPower: Power = {
      id: editingSubPower?.id ?? generateId(),
      name: powerName,
      alias: isCustomPower ? (subPowerFormData.alias || editingSubPower?.alias) : subPowerFormData.alias || undefined,
      type: powerType as Power['type'],
      notes: subPowerFormData.notes || undefined,
      baseCost,
      activeCost,
      realCost,
      levels: subPowerFormData.levels,
      position: editingSubPower?.position ?? compoundChildPowers.length,
      effectDice: subPowerDef?.doesDamage ? `${subPowerFormData.levels}d6` : editingSubPower?.effectDice,
      endCost,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      duration: subPowerDef?.duration ?? editingSubPower?.duration,
      range: (subPowerDef?.range ?? editingSubPower?.range) as Power['range'],
      doesDamage: subPowerDef?.doesDamage ?? editingSubPower?.doesDamage,
      killing: subPowerDef?.isKilling ?? editingSubPower?.killing,
    };

    if (editingSubPower) {
      setCompoundChildPowers(compoundChildPowers.map(p => p.id === editingSubPower.id ? newSubPower : p));
    } else {
      setCompoundChildPowers([...compoundChildPowers, newSubPower]);
    }
    
    setShowSubPowerModal(false);
  };

  const deleteSubPower = (subPowerId: string) => {
    setCompoundChildPowers(compoundChildPowers.filter(p => p.id !== subPowerId));
  };

  const addSubPowerModifier = (modDef: typeof ADVANTAGES[string] | typeof LIMITATIONS[string]) => {
    const newMod: SelectedModifier = {
      xmlId: modDef.xmlId,
      name: modDef.display,
      value: modDef.baseCost,
      isAdvantage: modDef.isAdvantage,
      isLimitation: modDef.isLimitation,
      levels: modDef.hasLevels ? 1 : undefined,
    };
    
    setSubPowerFormData({
      ...subPowerFormData,
      selectedModifiers: [...subPowerFormData.selectedModifiers, newMod],
    });
  };

  const removeSubPowerModifier = (index: number) => {
    setSubPowerFormData({
      ...subPowerFormData,
      selectedModifiers: subPowerFormData.selectedModifiers.filter((_, i) => i !== index),
    });
  };

  const updateModifierLevels = (index: number, levels: number) => {
    const mods = [...formData.selectedModifiers];
    const mod = mods[index];
    if (!mod) return;
    
    const modDef = ADVANTAGES[mod.xmlId] ?? LIMITATIONS[mod.xmlId];
    
    if (modDef && modDef.hasLevels && modDef.lvlCost) {
      mod.levels = levels;
      // Recalculate value based on levels
      mod.value = modDef.baseCost + (modDef.lvlCost * (levels - 1));
    }
    
    setFormData({ ...formData, selectedModifiers: mods });
  };

  const calculateCosts = () => {
    // For lists, cost is calculated from children - return 0 here
    if (isEditingList) {
      return { baseCost: 0, activeCost: 0, realCost: 0, endCost: 0 };
    }
    
    // For compound powers, sum the child power costs
    if (isCompound) {
      const totalReal = compoundChildPowers.reduce((sum, p) => sum + (p.realCost ?? 0), 0);
      const totalActive = compoundChildPowers.reduce((sum, p) => sum + (p.activeCost ?? 0), 0);
      return { baseCost: totalActive, activeCost: totalActive, realCost: totalReal, endCost: 0 };
    }
    
    if (!selectedPowerDef) {
      return { baseCost: 0, activeCost: 0, realCost: 0, endCost: 0 };
    }

    // Base cost from power definition + adders
    const powerBaseCost = calculatePowerBaseCost(selectedPowerDef, formData.levels);
    const adderCost = calculateAdderCost(formData.adders);
    const baseCost = powerBaseCost + adderCost;
    
    // Include both own modifiers and inherited modifiers from parent list
    const allModifiers = [...formData.selectedModifiers];
    
    // Own advantages
    const ownAdvantageTotal = allModifiers
      .filter(m => m.isAdvantage)
      .reduce((sum, m) => sum + m.value, 0);
    
    // Inherited advantages from parent list
    const inheritedAdvantageTotal = inheritedModifiers
      .filter(m => m.isAdvantage)
      .reduce((sum, m) => sum + m.value, 0);
    
    const advantageTotal = ownAdvantageTotal + inheritedAdvantageTotal;
    
    // Own limitations
    const ownLimitationTotal = allModifiers
      .filter(m => m.isLimitation)
      .reduce((sum, m) => sum + Math.abs(m.value), 0);
    
    // Inherited limitations from parent list
    const inheritedLimitationTotal = inheritedModifiers
      .filter(m => m.isLimitation)
      .reduce((sum, m) => sum + Math.abs(m.value), 0);
    
    const totalLimitations = ownLimitationTotal + inheritedLimitationTotal;
    
    const activeCost = Math.floor(baseCost * (1 + advantageTotal));
    const realCost = totalLimitations > 0 
      ? Math.floor(activeCost / (1 + totalLimitations))
      : activeCost;
    
    const endCost = selectedPowerDef.usesEnd !== false ? Math.ceil(activeCost / 10) : 0;
    
    return { baseCost, activeCost, realCost, endCost };
  };

  const handleSave = () => {
    // Handle saving a list container
    if (isEditingList) {
      const modifiers: Modifier[] = formData.selectedModifiers.map(mod => ({
        id: mod.xmlId,
        name: mod.name,
        alias: mod.optionName,
        value: mod.value,
        isAdvantage: mod.isAdvantage,
        isLimitation: mod.isLimitation,
        levels: mod.levels,
        notes: mod.notes,
        adders: mod.adders,
      }));
      
      // Build adders array - include discount adder if set
      const listAdders: Adder[] = [];
      if (formData.discountAdder < 0) {
        listAdders.push({
          id: generateId(),
          name: 'Discount',
          baseCost: formData.discountAdder,
        });
      }
      
      const newList: Power = {
        id: editingPower?.id ?? generateId(),
        name: formData.name || 'Power List',
        alias: formData.alias || undefined,
        type: 'LIST' as Power['type'],
        notes: formData.notes || undefined,
        baseCost: 0,
        activeCost: 0,
        realCost: 0,
        levels: 0,
        position: editingPower?.position ?? powers.length,
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        adders: listAdders.length > 0 ? listAdders : undefined,
        isContainer: true,
      };
      
      let updatedPowers: Power[];
      if (editingPower) {
        // Get the old discount for comparison
        const oldDiscountAdder = editingPower.adders?.find(a => a.baseCost < 0);
        const oldDiscount = oldDiscountAdder?.baseCost ?? 0;
        const newDiscount = formData.discountAdder;
        
        updatedPowers = powers.map(p => {
          if (p.id === editingPower.id) {
            return newList;
          }
          // Recalculate child costs if discount changed
          if (p.parentId === editingPower.id && oldDiscount !== newDiscount) {
            // Remove old discount, apply new discount
            const baseRealCost = (p.realCost ?? 0) - oldDiscount; // Restore to pre-discount cost
            return {
              ...p,
              realCost: Math.max(0, baseRealCost + newDiscount),
            };
          }
          return p;
        });
      } else {
        updatedPowers = [...powers, newList];
      }
      
      // Recalculate list costs based on children
      updatedPowers = recalculateListCosts(updatedPowers);
      
      onUpdate({ ...character, powers: updatedPowers });
      setIsModalOpen(false);
      return;
    }
    
    // Calculate costs first (needed by both compound and regular powers)
    const costs = calculateCosts();
    
    // Handle saving a compound power
    if (isCompound) {
      const compoundPowerId = editingPower?.id ?? generateId();
      
      const newCompoundPower: Power = {
        id: compoundPowerId,
        name: formData.name || 'Compound Power',
        alias: formData.alias || undefined,
        type: 'COMPOUNDPOWER',
        notes: formData.notes || undefined,
        baseCost: costs.activeCost,
        activeCost: costs.activeCost,
        realCost: costs.realCost,
        levels: 0,
        position: editingPower?.position ?? powers.length,
        parentId: parentListId ?? editingPower?.parentId,
      };
      
      // Set parentId on all child powers
      const childPowersWithParent = compoundChildPowers.map((p, index) => ({
        ...p,
        parentId: compoundPowerId,
        position: index,
      }));
      
      let updatedPowers: Power[];
      if (editingPower) {
        // Remove old compound power and its children, then add updated ones
        const oldChildIds = new Set(powers.filter(p => p.parentId === editingPower.id).map(p => p.id));
        updatedPowers = powers.filter(p => p.id !== editingPower.id && !oldChildIds.has(p.id));
        updatedPowers = [...updatedPowers, newCompoundPower, ...childPowersWithParent];
      } else {
        updatedPowers = [...powers, newCompoundPower, ...childPowersWithParent];
      }
      
      // Recalculate list costs if parent is a list
      updatedPowers = recalculateListCosts(updatedPowers);
      
      onUpdate({ ...character, powers: updatedPowers });
      setIsModalOpen(false);
      return;
    }
    
    // Regular power saving
    const modifiers: Modifier[] = formData.selectedModifiers.map(mod => ({
      id: mod.xmlId,
      name: mod.name,
      alias: mod.optionName,
      value: mod.value,
      isAdvantage: mod.isAdvantage,
      isLimitation: mod.isLimitation,
      levels: mod.levels,
      notes: mod.notes,
      adders: mod.adders,
    }));
    
    // For custom powers (no selectedPowerDef), preserve the original name and type
    const isCustomPower = !selectedPowerDef;
    const powerName = isCustomPower 
      ? (formData.name || editingPower?.name || 'Custom Power')
      : (formData.alias || selectedPowerDef.display);
    const powerType = isCustomPower
      ? (editingPower?.type ?? 'GENERIC')
      : selectedPowerDef.xmlId;
    
    const newPower: Power = {
      id: editingPower?.id ?? generateId(),
      name: powerName,
      alias: isCustomPower ? (formData.alias || editingPower?.alias) : formData.alias || undefined,
      type: powerType as Power['type'],
      notes: formData.notes || undefined,
      baseCost: costs.baseCost,
      activeCost: costs.activeCost,
      realCost: costs.realCost,
      levels: formData.levels,
      position: editingPower?.position ?? powers.length,
      effectDice: selectedPowerDef?.doesDamage ? `${formData.levels}d6` : editingPower?.effectDice,
      endCost: costs.endCost,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      duration: selectedPowerDef?.duration ?? editingPower?.duration,
      range: (selectedPowerDef?.range ?? editingPower?.range) as Power['range'],
      doesDamage: selectedPowerDef?.doesDamage ?? editingPower?.doesDamage,
      killing: selectedPowerDef?.isKilling ?? editingPower?.killing,
      parentId: parentListId ?? editingPower?.parentId,
    };

    let updatedPowers: Power[];
    if (editingPower) {
      updatedPowers = powers.map(p => (p.id === editingPower.id ? newPower : p));
    } else {
      updatedPowers = [...powers, newPower];
    }

    // Recalculate list costs
    updatedPowers = recalculateListCosts(updatedPowers);

    onUpdate({ ...character, powers: updatedPowers });
    setIsModalOpen(false);
  };

  // Helper to recalculate list container costs based on children
  const recalculateListCosts = (powerList: Power[]): Power[] => {
    return powerList.map(power => {
      if (power.isContainer || power.type === 'LIST') {
        const children = powerList.filter(p => p.parentId === power.id);
        const totalReal = children.reduce((sum, c) => sum + (c.realCost ?? 0), 0);
        const totalActive = children.reduce((sum, c) => sum + (c.activeCost ?? 0), 0);
        return { ...power, realCost: totalReal, activeCost: totalActive, baseCost: totalActive };
      }
      return power;
    });
  };

  // Move a power to a different list (or to top level if targetListId is null)
  const movePowerToList = (powerId: string, targetListId: string | null) => {
    let updatedPowers = powers.map(p => {
      if (p.id === powerId) {
        // If moving to a list, apply the list's limitations and discounts
        const parentList = targetListId ? powers.find(lp => lp.id === targetListId) : undefined;
        let realCost = p.activeCost ?? p.baseCost ?? 0;
        
        if (parentList?.modifiers) {
          const listLimitations = parentList.modifiers
            .filter(m => m.isLimitation)
            .reduce((sum, m) => sum + Math.abs(m.value), 0);
          
          const ownLimitations = (p.modifiers ?? [])
            .filter(m => m.isLimitation)
            .reduce((sum, m) => sum + Math.abs(m.value), 0);
          
          const totalLimitations = listLimitations + ownLimitations;
          if (totalLimitations > 0) {
            realCost = Math.floor((p.activeCost ?? p.baseCost ?? 0) / (1 + totalLimitations));
          }
        }
        
        // Apply discount adder from parent list (like Cantrip's -1)
        if (parentList?.adders) {
          const discountAdder = parentList.adders.find(a => a.baseCost < 0);
          if (discountAdder) {
            realCost = Math.max(0, realCost + discountAdder.baseCost);
          }
        }
        
        return { ...p, parentId: targetListId ?? undefined, realCost };
      }
      return p;
    });
    
    updatedPowers = recalculateListCosts(updatedPowers);
    onUpdate({ ...character, powers: updatedPowers });
  };

  const handleDelete = (powerId: string) => {
    // Also delete any child powers
    const idsToDelete = new Set([powerId]);
    powers.forEach(p => {
      if (p.parentId === powerId) {
        idsToDelete.add(p.id);
      }
    });
    
    onUpdate({
      ...character,
      powers: powers.filter(p => !idsToDelete.has(p.id)),
    });
  };

  const togglePowerExpanded = (powerId: string) => {
    const newExpanded = new Set(expandedPowers);
    if (newExpanded.has(powerId)) {
      newExpanded.delete(powerId);
    } else {
      newExpanded.add(powerId);
    }
    setExpandedPowers(newExpanded);
  };

  // Filter for compound/parent powers only at top level
  // parentId in HDC files often refers to LIST containers (for grouping), not actual parent powers
  // Only filter out powers whose parentId matches another power's ID (true compound powers)
  const powerIds = new Set(powers.map(p => p.id));
  const topLevelPowers = powers.filter(p => !p.parentId || !powerIds.has(p.parentId));

  const getChildPowers = (parentId: string) => {
    return powers.filter(p => p.parentId === parentId && powerIds.has(parentId));
  };

  /**
   * Get the damage string for an attack power, including STR adds if applicable
   */
  const getAttackDamageDisplay = (power: Power): string | null => {
    const def = matchPowerToDefinition(power);
    if (!def?.doesDamage) return null;
    
    const baseDice = power.levels ?? 1;
    const isKilling = def.isKilling ?? power.killing;
    
    // Check if HTH attack (gets STR adds)
    const isHth = ['HANDTOHANDATTACK', 'HANDKILLING', 'KILLINGATTACK'].includes(def.xmlId) ||
                  power.range === 'NO_RANGE' || power.range === 'SELF';
    
    // Check for No STR Bonus limitation
    const hasNoStrBonus = power.modifiers?.some(m => 
      m.id === 'NOSTRBONUS' || m.name.toLowerCase().includes('no str')
    );
    
    if (isHth && !hasNoStrBonus) {
      const strDamage = calculateStrDamage(charStr);
      const dc = calculateDamageClasses(baseDice, !!isKilling);
      if (isKilling) {
        return `${baseDice}d6K + ${strDamage} STR (${dc} DC)`;
      } else {
        return `${baseDice}d6 + ${strDamage} STR`;
      }
    }
    
    return isKilling ? `${baseDice}d6K` : `${baseDice}d6`;
  };

  const filteredModifiers = useMemo(() => {
    if (modifierType === 'custom') return []; // Custom tab doesn't use the list
    const list = modifierType === 'advantage' ? ALL_ADVANTAGES : ALL_LIMITATIONS;
    if (!modifierSearchTerm) return list;
    
    const search = modifierSearchTerm.toLowerCase();
    return list.filter(m => 
      m.display.toLowerCase().includes(search) ||
      m.xmlId.toLowerCase().includes(search) ||
      m.description?.toLowerCase().includes(search)
    );
  }, [modifierType, modifierSearchTerm]);

  const costs = calculateCosts();

  if (powers.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚡</div>
        <div className="empty-state-title">No Powers</div>
        <p>This character has no powers yet.</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => openAddModal(false)}>
            Add Power
          </button>
          <button className="btn btn-secondary" onClick={() => openAddModal(true)}>
            Add Compound Power
          </button>
          <button className="btn btn-secondary" onClick={openAddListModal}>
            Add List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="powers-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Powers ({totalCost} pts)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => openAddModal(false)}>
              Add Power
            </button>
            <button className="btn btn-secondary" onClick={() => openAddModal(true)}>
              Add Compound
            </button>
            <button className="btn btn-secondary" onClick={openAddListModal} title="Add a power list/framework with shared modifiers">
              Add List
            </button>
          </div>
        </div>
        {/* Column headers */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0.5rem 1rem', 
          borderBottom: '1px solid var(--border-color)',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
        }}>
          <div style={{ flex: 1 }}>Power</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right' }}>END</div>
            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right' }}>Active</div>
            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right' }}>Real</div>
          </div>
          <div style={{ width: '100px', flexShrink: 0, marginLeft: '1rem' }}></div> {/* Space for actions - fixed width to match 3 buttons */}
        </div>
        <div className="item-list">
          {topLevelPowers.map(power => {
            const children = getChildPowers(power.id);
            const isExpanded = expandedPowers.has(power.id);
            const damageDisplay = getAttackDamageDisplay(power);
            const isCompoundPower = power.type === 'COMPOUNDPOWER';
            // isList: only true LIST containers, not compound powers
            const isList = (power.isContainer || power.type === 'LIST') && !isCompoundPower;
            
            return (
              <div key={power.id}>
                <div
                  className="item-row"
                  style={{ 
                    borderLeft: `3px solid ${isList ? 'var(--warning-color)' : (isCompoundPower ? 'var(--secondary-color)' : 'var(--primary-color)')}`,
                    cursor: isList ? 'pointer' : 'default',
                    backgroundColor: isList ? 'rgba(255, 193, 7, 0.05)' : (isCompoundPower ? 'rgba(139, 92, 246, 0.05)' : undefined),
                    minHeight: '48px',
                    boxSizing: 'border-box',
                  }}
                  onClick={() => isList && togglePowerExpanded(power.id)}
                >
                  <div className="item-info" style={{ flex: 1 }}>
                    <div className="item-name">
                      {isList && (
                        <span style={{ marginRight: '0.5rem' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      )}
                      {isList && <span style={{ marginRight: '0.5rem' }}>📁</span>}
                      {isCompoundPower && <span style={{ marginRight: '0.5rem' }}>⚡</span>}
                      <strong>{power.name}{isList ? '' : ':'}</strong>
                      {!isList && power.alias && power.alias !== power.name && ` ${power.alias}`}
                    </div>
                    <div className="item-details">
                      {isList && power.modifiers && power.modifiers.length > 0 && (
                        <span style={{ color: 'var(--warning-color)' }}>
                          List Modifiers: {power.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}
                        </span>
                      )}
                      {!isList && damageDisplay && (
                        <span className="damage-display" style={{ 
                          color: 'var(--danger-color)', 
                          fontWeight: 600,
                          marginRight: '0.5rem'
                        }}>
                          {damageDisplay}
                        </span>
                      )}
                      {!isList && !damageDisplay && power.effectDice && (
                        <span>{power.effectDice}</span>
                      )}
                      {!isList && power.modifiers && power.modifiers.length > 0 && (
                        <span style={{ marginLeft: '0.5rem' }}>
                          • {power.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}
                        </span>
                      )}
                    </div>
                    {power.notes && power.notes !== power.alias && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {power.notes}
                      </div>
                    )}
                    {/* Compound power sub-powers shown inline */}
                    {isCompoundPower && children.length > 0 && (
                      <div style={{ 
                        marginTop: '0.5rem', 
                        paddingTop: '0.5rem', 
                        borderTop: '1px solid var(--border-color)',
                        fontSize: '0.875rem'
                      }}>
                        {children.map((child, idx) => {
                          const childDamageDisplay = getAttackDamageDisplay(child);
                          return (
                            <div key={child.id} style={{ 
                              marginLeft: '0.5rem',
                              marginBottom: idx < children.length - 1 ? '0.25rem' : 0,
                              color: 'var(--text-primary)'
                            }}>
                              <span style={{ color: 'var(--secondary-color)', marginRight: '0.25rem' }}>•</span>
                              <strong>{child.name || child.type}:</strong> {child.alias}
                              {child.activeCost && <span style={{ color: 'var(--text-secondary)' }}> ({child.activeCost} AP)</span>}
                              {childDamageDisplay && (
                                <span style={{ color: 'var(--danger-color)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                  {childDamageDisplay}
                                </span>
                              )}
                              {child.modifiers && child.modifiers.length > 0 && (
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                  [{child.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}]
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
                    {/* Endurance cost column - only for non-list powers */}
                    <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {!isList && power.endCost !== undefined && power.endCost > 0 ? power.endCost : '\u00A0'}
                    </div>
                    {/* Active cost column - only for non-list powers */}
                    <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {!isList && power.activeCost !== power.realCost && power.activeCost ? power.activeCost : '\u00A0'}
                    </div>
                    {/* Real cost column */}
                    <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}>
                      {power.realCost ?? power.baseCost ?? 0}
                    </div>
                  </div>
                  <div className="item-actions" onClick={e => e.stopPropagation()}>
                    {/* Move to list - compact icon button with popup */}
                    {!isList && powerLists.length > 0 && (
                      <div data-move-menu style={{ position: 'relative' }}>
                        <button
                          className="btn-icon-small"
                          onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === power.id ? null : power.id)}
                          title="Move to list"
                          style={{ 
                            opacity: 1,
                            background: moveMenuOpenFor === power.id ? 'var(--surface)' : undefined,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
                        </button>
                        {moveMenuOpenFor === power.id && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            zIndex: 1000,
                            background: 'var(--surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            minWidth: '200px',
                            maxHeight: '250px',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                          }}>
                            <div
                              style={{
                                padding: '0.5rem 0.75rem',
                                cursor: 'pointer',
                                background: !power.parentId ? 'var(--primary-color)' : undefined,
                                color: !power.parentId ? 'white' : undefined,
                              }}
                              onClick={() => { movePowerToList(power.id, null); setMoveMenuOpenFor(null); }}
                              onMouseEnter={e => { if (power.parentId) e.currentTarget.style.background = 'var(--surface-light)'; }}
                              onMouseLeave={e => { if (power.parentId) e.currentTarget.style.background = ''; }}
                            >
                              No List
                            </div>
                            {powerLists.map(list => (
                              <div
                                key={list.id}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  cursor: 'pointer',
                                  background: power.parentId === list.id ? 'var(--primary-color)' : undefined,
                                  color: power.parentId === list.id ? 'white' : undefined,
                                }}
                                onClick={() => { movePowerToList(power.id, list.id); setMoveMenuOpenFor(null); }}
                                onMouseEnter={e => { if (power.parentId !== list.id) e.currentTarget.style.background = 'var(--surface-light)'; }}
                                onMouseLeave={e => { if (power.parentId !== list.id) e.currentTarget.style.background = ''; }}
                              >
                                {list.name || list.alias}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      className="btn-icon-small"
                      onClick={() => openEditModal(power)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon-small"
                      onClick={() => handleDelete(power.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                {/* Child powers for LIST containers only - compound power children are shown inline above */}
                {isList && isExpanded && (
                  <div style={{ marginLeft: '2rem', borderLeft: '2px solid var(--warning-color)' }}>
                    {children.map(child => {
                      const childDamageDisplay = getAttackDamageDisplay(child);
                      const parentList = getParentList(child);
                      const listModifiers = parentList?.modifiers ?? [];
                      const grandChildren = powers.filter(p => p.parentId === child.id);
                      const isCompoundChild = child.type === 'COMPOUNDPOWER';
                      
                      return (
                        <div
                          key={child.id}
                          className="item-row"
                          style={{ 
                            borderLeft: '3px solid var(--primary-color)',
                            backgroundColor: 'var(--background-tertiary)',
                            minHeight: '48px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div className="item-info">
                            <div className="item-name">
                              <strong>{child.name}:</strong> {child.alias}
                            </div>
                            <div className="item-details">
                              {childDamageDisplay && (
                                <span style={{ color: 'var(--danger-color)', fontWeight: 600, marginRight: '0.5rem' }}>
                                  {childDamageDisplay}
                                </span>
                              )}
                              {!childDamageDisplay && child.effectDice && <span>{child.effectDice}</span>}
                              {child.modifiers && child.modifiers.length > 0 && (
                                <span style={{ marginLeft: '0.5rem' }}>
                                  • {child.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}
                                </span>
                              )}
                              {listModifiers.length > 0 && (
                                <span style={{ marginLeft: '0.5rem', color: 'var(--warning-color)', fontStyle: 'italic' }}>
                                  • [From List: {listModifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}]
                                </span>
                              )}
                            </div>
                            {isCompoundChild && grandChildren.length > 0 && (
                              <div style={{ 
                                marginTop: '0.5rem', 
                                paddingTop: '0.5rem', 
                                borderTop: '1px solid var(--border-color)',
                                fontSize: '0.875rem'
                              }}>
                                {grandChildren.map((grandChild, idx) => {
                                  const grandChildDamageDisplay = getAttackDamageDisplay(grandChild);
                                  return (
                                    <div key={grandChild.id} style={{ 
                                      marginLeft: '0.5rem',
                                      marginBottom: idx < grandChildren.length - 1 ? '0.25rem' : 0,
                                      color: 'var(--text-primary)'
                                    }}>
                                      <span style={{ color: 'var(--secondary-color)', marginRight: '0.25rem' }}>•</span>
                                      <strong>{grandChild.name || grandChild.type}:</strong> {grandChild.alias}
                                      {grandChild.activeCost && <span style={{ color: 'var(--text-secondary)' }}> ({grandChild.activeCost} AP)</span>}
                                      {grandChildDamageDisplay && (
                                        <span style={{ color: 'var(--danger-color)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                          {grandChildDamageDisplay}
                                        </span>
                                      )}
                                      {grandChild.modifiers && grandChild.modifiers.length > 0 && (
                                        <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                          [{grandChild.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}]
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
                            {/* Endurance cost column */}
                            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                              {child.endCost !== undefined && child.endCost > 0 ? child.endCost : '\u00A0'}
                            </div>
                            {/* Active cost column */}
                            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                              {child.activeCost !== child.realCost && child.activeCost ? child.activeCost : '\u00A0'}
                            </div>
                            {/* Real cost column */}
                            <div style={{ width: '45px', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}>
                              {child.realCost ?? child.baseCost ?? 0}
                            </div>
                          </div>
                          <div className="item-actions" onClick={e => e.stopPropagation()}>
                            {/* Move to list - compact icon button with popup */}
                            {powerLists.length > 0 && (
                              <div data-move-menu style={{ position: 'relative' }}>
                                <button
                                  className="btn-icon-small"
                                  onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === child.id ? null : child.id)}
                                  title="Move to list"
                                  style={{ 
                                    opacity: 1,
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
                                    minWidth: '200px',
                                    maxHeight: '250px',
                                    overflowY: 'auto',
                                    overflowX: 'hidden',
                                  }}>
                                    <div
                                      style={{
                                        padding: '0.5rem 0.75rem',
                                        cursor: 'pointer',
                                        background: !child.parentId ? 'var(--primary-color)' : undefined,
                                        color: !child.parentId ? 'white' : undefined,
                                      }}
                                      onClick={() => { movePowerToList(child.id, null); setMoveMenuOpenFor(null); }}
                                      onMouseEnter={e => { if (child.parentId) e.currentTarget.style.background = 'var(--surface-light)'; }}
                                      onMouseLeave={e => { if (child.parentId) e.currentTarget.style.background = ''; }}
                                    >
                                      No List
                                    </div>
                                    {powerLists.map(list => (
                                      <div
                                        key={list.id}
                                        style={{
                                          padding: '0.5rem 0.75rem',
                                          cursor: 'pointer',
                                          background: child.parentId === list.id ? 'var(--primary-color)' : undefined,
                                          color: child.parentId === list.id ? 'white' : undefined,
                                        }}
                                        onClick={() => { movePowerToList(child.id, list.id); setMoveMenuOpenFor(null); }}
                                        onMouseEnter={e => { if (child.parentId !== list.id) e.currentTarget.style.background = 'var(--surface-light)'; }}
                                        onMouseLeave={e => { if (child.parentId !== list.id) e.currentTarget.style.background = ''; }}
                                      >
                                        {list.name || list.alias}
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
                    {/* Add power to this list buttons */}
                    {isList && (
                      <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-primary" 
                          style={{ fontSize: '0.875rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddModal(false, power.id);
                          }}
                        >
                          + Add Power
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.875rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddModal(true, power.id);
                          }}
                        >
                          + Add Compound
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Power Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditingList 
          ? (editingPower ? 'Edit List' : 'Add List')
          : isCompound
            ? (editingPower ? 'Edit Compound Power' : 'Add Compound Power')
            : (editingPower ? 'Edit Power' : 'Add Power')
        }
        size="large"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            {!isEditingList && !isCompound && (
              <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
                <span>Base: {costs.baseCost}</span>
                <span>Active: {costs.activeCost}</span>
                <span style={{ fontWeight: 600 }}>Real: {costs.realCost} pts</span>
                <span>END: {costs.endCost}</span>
              </div>
            )}
            {isCompound && (
              <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
                <span style={{ fontWeight: 600 }}>Total: {costs.realCost} pts</span>
                <span>({compoundChildPowers.length} sub-powers)</span>
              </div>
            )}
            {isEditingList && (
              <div style={{ color: 'var(--text-secondary)', marginRight: 'auto' }}>
                List modifiers apply to all powers within
              </div>
            )}
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingPower ? 'Save Changes' : (isEditingList ? 'Add List' : isCompound ? 'Add Compound Power' : 'Add Power')}
            </button>
          </div>
        }
      >
        {/* Compound Power UI */}
        {isCompound ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Compound Power Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., The Better Part of Valour"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Description of this compound power..."
                rows={2}
              />
            </div>
            
            {/* Sub-Powers List */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Sub-Powers</label>
                <button className="btn btn-primary" onClick={openAddSubPowerModal}>
                  + Add Sub-Power
                </button>
              </div>
              
              {compoundChildPowers.length === 0 ? (
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '4px',
                }}>
                  No sub-powers added. Click &quot;Add Sub-Power&quot; to add powers to this compound.
                </div>
              ) : (
                <div style={{ 
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {compoundChildPowers.map((subPower, index) => {
                    const subPowerDef = matchPowerToDefinition(subPower);
                    return (
                      <div 
                        key={subPower.id}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem',
                          padding: '0.75rem',
                          borderBottom: index < compoundChildPowers.length - 1 ? '1px solid var(--border-color)' : undefined,
                          backgroundColor: index % 2 === 0 ? 'var(--background-secondary)' : undefined,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>
                            {subPower.name}{subPower.alias ? `: ${subPower.alias}` : ''}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {subPowerDef?.display || subPower.type} • {subPower.levels} level{subPower.levels !== 1 ? 's' : ''}
                            {subPower.modifiers && subPower.modifiers.length > 0 && (
                              <span> • {subPower.modifiers.map(m => m.name).join(', ')}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: '60px' }}>
                          <div style={{ fontWeight: 600 }}>{subPower.realCost ?? 0}</div>
                          {subPower.activeCost !== subPower.realCost && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Active: {subPower.activeCost}
                            </div>
                          )}
                        </div>
                        <button
                          className="btn-icon-small"
                          onClick={() => openEditSubPowerModal(subPower)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon-small"
                          onClick={() => deleteSubPower(subPower.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            {/* Only show power type selector for non-list editing */}
            {!isEditingList && (
            <div className="form-group">
              <label className="form-label">Power Type</label>
              <select
                className="form-select"
                value={selectedPowerDef?.xmlId ?? 'CUSTOM'}
                onChange={e => {
                  if (e.target.value === 'CUSTOM') {
                    setSelectedPowerDef(null);
                  } else {
                    handlePowerTypeChange(e.target.value);
                  }
                }}
              >
                {/* Custom Power option for imported/unknown powers */}
                <option value="CUSTOM">
                  -- Custom Power (manual entry) --
                </option>
                {Object.entries(POWER_CATEGORIES).map(([category, categoryPowers]) => (
                  categoryPowers.length > 0 && (
                    <optgroup key={category} label={category}>
                      {categoryPowers
                        .sort((a, b) => a.display.localeCompare(b.display))
                        .map(power => (
                          <option key={power.xmlId} value={power.xmlId}>
                            {power.display} ({power.lvlCost > 0 ? `${power.lvlCost}/level` : `${power.baseCost} pts`})
                          </option>
                        ))}
                    </optgroup>
                  )
                ))}
              </select>
              {selectedPowerDef && (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  {selectedPowerDef.description}
                </div>
              )}
            </div>
            )}

            {/* List Name - only for list editing */}
            {isEditingList && (
              <div className="form-group">
                <label className="form-label">List Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Skralk Powers, Cyborg Systems"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  A name for this power list/framework
                </div>
              </div>
            )}

            {/* Discount Adder - only for list editing */}
            {isEditingList && (
              <div className="form-group">
                <label className="form-label">Discount Adder (optional)</label>
                <select
                  className="form-select"
                  value={formData.discountAdder}
                  onChange={e => setFormData({ ...formData, discountAdder: parseInt(e.target.value) })}
                >
                  <option value="0">No discount</option>
                  <option value="-1">-1 point per power (e.g., Cantrips)</option>
                  <option value="-2">-2 points per power</option>
                  <option value="-3">-3 points per power</option>
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Reduces the real cost of each child power (for campaign-specific rules like free cantrips)
                </div>
              </div>
            )}

            {/* Power Name - required for custom powers, optional override for standard powers */}
            {!isEditingList && !selectedPowerDef && (
              <div className="form-group">
                <label className="form-label">Power Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Tribunal Regeneration, Life Support"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  The name of this custom power
                </div>
              </div>
            )}

            {/* Power Name - shown for standard powers to display the custom name like "Demonic Claws" */}
            {!isEditingList && selectedPowerDef && (
            <div className="form-group">
              <label className="form-label">Power Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={`e.g., ${selectedPowerDef.display}`}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                A custom name for this power (e.g., &quot;Demonic Claws&quot; instead of &quot;Killing Attack - Hand-To-Hand&quot;)
              </div>
            </div>
            )}

            {/* Alias / Description - for custom powers only */}
            {!isEditingList && !selectedPowerDef && (
            <div className="form-group">
              <label className="form-label">Description / Alias</label>
              <input
                type="text"
                className="form-input"
                value={formData.alias}
                onChange={e => setFormData({ ...formData, alias: e.target.value })}
                placeholder="e.g., (1 BODY per Minute), Can Heal Limbs..."
              />
            </div>
            )}

            {/* Dice/Levels - hide for lists and for powers with fixed base cost (lvlCost === 0) */}
            {!isEditingList && selectedPowerDef && selectedPowerDef.lvlCost > 0 && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Dice / Levels</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.levels}
                  onChange={e => setFormData({ ...formData, levels: parseInt(e.target.value) || 1 })}
                  min={selectedPowerDef?.minVal ?? 1}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cost per Level</label>
                <input
                  type="number"
                  className="form-input"
                  value={selectedPowerDef?.lvlCost ?? 5}
                  disabled
                />
              </div>
            </div>
            )}

            {/* Power Properties - hide for lists */}
            {!isEditingList && selectedPowerDef && (
              <div className="form-group">
                <label className="form-label">Power Properties</label>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span className="tag">Range: {selectedPowerDef.range}</span>
                  <span className="tag">Duration: {selectedPowerDef.duration}</span>
                  {selectedPowerDef.target && <span className="tag">Target: {selectedPowerDef.target}</span>}
                  {selectedPowerDef.defense && <span className="tag">Defense: {selectedPowerDef.defense}</span>}
                  {selectedPowerDef.doesDamage && <span className="tag tag-danger">Does Damage</span>}
                  {selectedPowerDef.isKilling && <span className="tag tag-danger">Killing</span>}
                  {selectedPowerDef.doesKnockback && <span className="tag">Knockback</span>}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Special effects, descriptions..."
                rows={3}
              />
            </div>
          </div>

          <div>
            {/* Inherited Modifiers from Parent List (read-only) */}
            {inheritedModifiers.length > 0 && (
              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--warning-color)' }}>
                  📁 Inherited from List (read-only)
                </label>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.5rem',
                  opacity: 0.7,
                }}>
                  {inheritedModifiers.map((mod, index) => (
                    <div 
                      key={`inherited-${mod.id}-${index}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: mod.isAdvantage ? 'rgba(0, 200, 0, 0.05)' : 'rgba(200, 0, 0, 0.05)',
                        borderRadius: '4px',
                        border: `1px dashed ${mod.isAdvantage ? 'rgba(0, 200, 0, 0.3)' : 'rgba(200, 0, 0, 0.3)'}`,
                      }}
                    >
                      <span style={{ flex: 1, fontStyle: 'italic' }}>
                        {mod.name} ({formatModifierValue(mod.value)})
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        From List
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Modifiers */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">
                  {isEditingList ? 'List Modifiers (apply to all powers in list)' : 'Modifiers'}
                </label>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setModifierSearchTerm('');
                    setShowModifierModal(true);
                  }}
                >
                  + Add Modifier
                </button>
              </div>
              
              {formData.selectedModifiers.length === 0 ? (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '4px',
                }}>
                  No modifiers added. Click &quot;Add Modifier&quot; to add advantages or limitations.
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.5rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {/* Advantages first */}
                  {formData.selectedModifiers
                    .filter(m => m.isAdvantage)
                    .map((mod, index) => {
                      const realIndex = formData.selectedModifiers.indexOf(mod);
                      const modDef = ADVANTAGES[mod.xmlId];
                      return (
                        <div 
                          key={`${mod.xmlId}-${index}`}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: 'rgba(0, 200, 0, 0.1)',
                            borderRadius: '4px',
                            border: '1px solid rgba(0, 200, 0, 0.3)',
                          }}
                        >
                          <span style={{ flex: 1 }}>
                            {mod.name} ({formatModifierValue(mod.value)})
                          </span>
                          {modDef?.hasLevels && (
                            <input
                              type="number"
                              value={mod.levels ?? 1}
                              onChange={e => updateModifierLevels(realIndex, parseInt(e.target.value) || 1)}
                              min={1}
                              style={{ width: '60px' }}
                              className="form-input"
                            />
                          )}
                          <button 
                            className="btn-icon-small"
                            onClick={() => removeModifier(realIndex)}
                            title="Remove"
                          >
                            ❌
                          </button>
                        </div>
                      );
                    })}
                  
                  {/* Then limitations */}
                  {formData.selectedModifiers
                    .filter(m => m.isLimitation)
                    .map((mod, index) => {
                      const realIndex = formData.selectedModifiers.indexOf(mod);
                      const modDef = LIMITATIONS[mod.xmlId];
                      return (
                        <div 
                          key={`${mod.xmlId}-${index}`}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: 'rgba(200, 0, 0, 0.1)',
                            borderRadius: '4px',
                            border: '1px solid rgba(200, 0, 0, 0.3)',
                          }}
                        >
                          <span style={{ flex: 1 }}>
                            {mod.name} ({formatModifierValue(mod.value)})
                          </span>
                          {modDef?.hasLevels && (
                            <input
                              type="number"
                              value={mod.levels ?? 1}
                              onChange={e => updateModifierLevels(realIndex, parseInt(e.target.value) || 1)}
                              min={1}
                              style={{ width: '60px' }}
                              className="form-input"
                            />
                          )}
                          <button 
                            className="btn-icon-small"
                            onClick={() => removeModifier(realIndex)}
                            title="Remove"
                          >
                            ❌
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Power Adders Section */}
            {selectedPowerDef?.adders && selectedPowerDef.adders.length > 0 && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Power Adders</label>
                  {availableAdders.length > 0 && (
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() => setShowAdderModal(true)}
                    >
                      + Add Adder
                    </button>
                  )}
                </div>
                
                {formData.adders.length > 0 ? (
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: 'rgba(100, 149, 237, 0.1)',
                    borderRadius: '4px',
                    border: '1px solid rgba(100, 149, 237, 0.3)',
                  }}>
                    {formData.adders.map((adder, idx) => {
                      const adderCost = (adder.baseCost ?? 0) + ((adder.levels ?? 0) * (adder.lvlCost ?? 0));
                      const isLeveled = adder.lvlCost !== undefined && adder.lvlCost > 0;
                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.5rem',
                            backgroundColor: 'rgba(100, 149, 237, 0.1)',
                            borderRadius: '4px',
                            marginBottom: idx < formData.adders.length - 1 ? '0.5rem' : 0,
                          }}
                        >
                          <span style={{ flex: 1, fontWeight: 500 }}>{adder.name}</span>
                          {isLeveled && (
                            <input
                              type="number"
                              value={adder.levels ?? 1}
                              onChange={e => updateAdderLevels(idx, parseInt(e.target.value) || 1)}
                              min={1}
                              style={{ width: '60px' }}
                              className="form-input"
                            />
                          )}
                          <span style={{ color: 'var(--text-secondary)', minWidth: '50px', textAlign: 'right' }}>
                            ({adderCost} pts)
                          </span>
                          <button 
                            className="btn-icon-small"
                            onClick={() => removeAdder(idx)}
                            title="Remove"
                          >
                            ❌
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: 'var(--background-secondary)',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                  }}>
                    No adders selected. {availableAdders.length > 0 && 'Click "+ Add Adder" to add damage dice or other enhancements.'}
                  </div>
                )}
              </div>
            )}

            {/* Cost Summary */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Cost Calculation</label>
              <div style={{ 
                padding: '1rem', 
                backgroundColor: 'var(--background-secondary)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              }}>
                {(() => {
                  const lvlCost = selectedPowerDef?.lvlCost ?? 0;
                  const baseCostFixed = selectedPowerDef?.baseCost ?? 0;
                  const powerCost = baseCostFixed + (lvlCost * formData.levels);
                  const adderTotal = calculateAdderCost(formData.adders);
                  const isFixedCost = lvlCost === 0;
                  
                  if (adderTotal > 0) {
                    return (
                      <>
                        {isFixedCost ? (
                          <div>Power Cost: {baseCostFixed} pts (fixed)</div>
                        ) : (
                          <div>Power Cost: {lvlCost} × {formData.levels} = {powerCost} pts</div>
                        )}
                        <div>Adders: +{adderTotal} pts</div>
                        <div>Base Cost: {powerCost} + {adderTotal} = {costs.baseCost} pts</div>
                      </>
                    );
                  } else {
                    if (isFixedCost) {
                      return <div>Base Cost: {baseCostFixed} pts (fixed)</div>;
                    }
                    return <div>Base Cost: {lvlCost} × {formData.levels} = {costs.baseCost} pts</div>;
                  }
                })()}
                {(() => {
                  const ownAdv = formData.selectedModifiers.filter(m => m.isAdvantage).reduce((s, m) => s + m.value, 0);
                  const inheritedAdv = inheritedModifiers.filter(m => m.isAdvantage).reduce((s, m) => s + m.value, 0);
                  const totalAdv = ownAdv + inheritedAdv;
                  return totalAdv > 0 ? (
                    <div style={{ color: 'green' }}>
                      Advantages: +{totalAdv.toFixed(2)}
                      {inheritedAdv > 0 && <span style={{ color: 'var(--text-secondary)' }}> (includes +{inheritedAdv.toFixed(2)} from list)</span>}
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const ownLim = formData.selectedModifiers.filter(m => m.isLimitation).reduce((s, m) => s + m.value, 0);
                  const inheritedLim = inheritedModifiers.filter(m => m.isLimitation).reduce((s, m) => s + m.value, 0);
                  const totalLim = ownLim + inheritedLim;
                  return totalLim < 0 ? (
                    <div style={{ color: 'red' }}>
                      Limitations: {totalLim.toFixed(2)}
                      {inheritedLim < 0 && <span style={{ color: 'var(--text-secondary)' }}> (includes {inheritedLim.toFixed(2)} from list)</span>}
                    </div>
                  ) : null;
                })()}
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                  <strong>Active Cost: {costs.activeCost}</strong>
                </div>
                <div>
                  <strong>Real Cost: {costs.realCost}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </Modal>

      {/* Sub-Power Edit Modal (for compound powers) */}
      <Modal
        isOpen={showSubPowerModal}
        onClose={() => setShowSubPowerModal(false)}
        title={editingSubPower ? 'Edit Sub-Power' : 'Add Sub-Power'}
        size="large"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
              {subPowerDef && (
                <>
                  <span>Base: {calculatePowerBaseCost(subPowerDef, subPowerFormData.levels)}</span>
                  <span>Active: {Math.floor(calculatePowerBaseCost(subPowerDef, subPowerFormData.levels) * (1 + subPowerFormData.selectedModifiers.filter(m => m.isAdvantage).reduce((s, m) => s + m.value, 0)))}</span>
                </>
              )}
            </div>
            <button className="btn btn-secondary" onClick={() => setShowSubPowerModal(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveSubPower}>
              {editingSubPower ? 'Save Changes' : 'Add Sub-Power'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div className="form-group">
              <label className="form-label">Power Type</label>
              <select
                className="form-select"
                value={subPowerDef?.xmlId ?? 'CUSTOM'}
                onChange={e => {
                  if (e.target.value === 'CUSTOM') {
                    setSubPowerDef(null);
                  } else {
                    const def = getPowerDefinition(e.target.value);
                    if (def) {
                      setSubPowerDef(def);
                      setSubPowerFormData({ ...subPowerFormData, name: def.display });
                    }
                  }
                }}
              >
                <option value="CUSTOM">-- Custom Power --</option>
                {Object.entries(POWER_CATEGORIES).map(([category, categoryPowers]) => (
                  categoryPowers.length > 0 && (
                    <optgroup key={category} label={category}>
                      {categoryPowers
                        .sort((a, b) => a.display.localeCompare(b.display))
                        .map(power => (
                          <option key={power.xmlId} value={power.xmlId}>
                            {power.display} ({power.lvlCost > 0 ? `${power.lvlCost}/level` : `${power.baseCost} pts`})
                          </option>
                        ))}
                    </optgroup>
                  )
                ))}
              </select>
            </div>

            {!subPowerDef && (
              <div className="form-group">
                <label className="form-label">Power Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={subPowerFormData.name}
                  onChange={e => setSubPowerFormData({ ...subPowerFormData, name: e.target.value })}
                  placeholder="Custom power name"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Alias / Description</label>
              <input
                type="text"
                className="form-input"
                value={subPowerFormData.alias}
                onChange={e => setSubPowerFormData({ ...subPowerFormData, alias: e.target.value })}
                placeholder="e.g., Fire Bolt, Force Field"
              />
            </div>

            {/* Hide Dice/Levels for fixed-cost powers (lvlCost === 0) */}
            {subPowerDef && subPowerDef.lvlCost > 0 && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Dice / Levels</label>
                <input
                  type="number"
                  className="form-input"
                  value={subPowerFormData.levels}
                  onChange={e => setSubPowerFormData({ ...subPowerFormData, levels: parseInt(e.target.value) || 1 })}
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cost per Level</label>
                <input
                  type="number"
                  className="form-input"
                  value={subPowerDef?.lvlCost ?? 0}
                  disabled
                />
              </div>
            </div>
            )}

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={subPowerFormData.notes}
                onChange={e => setSubPowerFormData({ ...subPowerFormData, notes: e.target.value })}
                placeholder="Special effects, descriptions..."
                rows={2}
              />
            </div>
          </div>

          <div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Modifiers</label>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setModifierSearchTerm('');
                    // We'll reuse the modifier modal but need to track we're editing a sub-power
                    setShowModifierModal(true);
                  }}
                >
                  + Add Modifier
                </button>
              </div>
              
              {subPowerFormData.selectedModifiers.length === 0 ? (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '4px',
                }}>
                  No modifiers. Click &quot;Add Modifier&quot; to add.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {subPowerFormData.selectedModifiers.map((mod, index) => (
                    <div 
                      key={`${mod.xmlId}-${index}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: mod.isAdvantage ? 'rgba(0, 200, 0, 0.1)' : 'rgba(200, 0, 0, 0.1)',
                        borderRadius: '4px',
                        border: `1px solid ${mod.isAdvantage ? 'rgba(0, 200, 0, 0.3)' : 'rgba(200, 0, 0, 0.3)'}`,
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        {mod.name} ({formatModifierValue(mod.value)})
                      </span>
                      <button 
                        className="btn-icon-small"
                        onClick={() => removeSubPowerModifier(index)}
                        title="Remove"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modifier Selection Modal */}
      <Modal
        isOpen={showModifierModal}
        onClose={() => setShowModifierModal(false)}
        title="Add Modifier"
        size="medium"
      >
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button
              className={`btn ${modifierType === 'advantage' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setModifierType('advantage')}
            >
              Advantages ({ALL_ADVANTAGES.length})
            </button>
            <button
              className={`btn ${modifierType === 'limitation' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setModifierType('limitation')}
            >
              Limitations ({ALL_LIMITATIONS.length})
            </button>
            <button
              className={`btn ${modifierType === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setModifierType('custom')}
            >
              Custom
            </button>
          </div>
          
          {modifierType !== 'custom' && (
            <input
              type="text"
              className="form-input"
              placeholder="Search modifiers..."
              value={modifierSearchTerm}
              onChange={e => setModifierSearchTerm(e.target.value)}
              autoFocus
            />
          )}
        </div>
        
        {modifierType === 'custom' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Modifier Name *</label>
              <input
                type="text"
                className="form-input"
                value={customModifier.name}
                onChange={e => setCustomModifier({ ...customModifier, name: e.target.value })}
                placeholder="e.g., Special Effect"
                autoFocus
              />
            </div>
            
            <div>
              <label className="form-label">Type</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${customModifier.isAdvantage ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCustomModifier({ ...customModifier, isAdvantage: true })}
                  style={{ flex: 1 }}
                >
                  ✓ Advantage
                </button>
                <button
                  className={`btn ${!customModifier.isAdvantage ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCustomModifier({ ...customModifier, isAdvantage: false })}
                  style={{ flex: 1 }}
                >
                  ✗ Limitation
                </button>
              </div>
            </div>
            
            <div>
              <label className="form-label">Value</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select
                  className="form-input"
                  value={customModifier.value}
                  onChange={e => setCustomModifier({ ...customModifier, value: parseFloat(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  <option value="0.25">¼</option>
                  <option value="0.5">½</option>
                  <option value="0.75">¾</option>
                  <option value="1">1</option>
                  <option value="1.25">1¼</option>
                  <option value="1.5">1½</option>
                  <option value="1.75">1¾</option>
                  <option value="2">2</option>
                  <option value="2.5">2½</option>
                  <option value="3">3</option>
                </select>
                <span style={{ 
                  color: customModifier.isAdvantage ? 'green' : 'red',
                  fontWeight: 600,
                  minWidth: '40px',
                }}>
                  {customModifier.isAdvantage ? '+' : '-'}{customModifier.value === 0.25 ? '¼' : customModifier.value === 0.5 ? '½' : customModifier.value === 0.75 ? '¾' : customModifier.value}
                </span>
              </div>
            </div>
            
            <div>
              <label className="form-label">Notes (optional)</label>
              <textarea
                className="form-input"
                value={customModifier.notes}
                onChange={e => setCustomModifier({ ...customModifier, notes: e.target.value })}
                placeholder="Description or conditions..."
                rows={2}
              />
            </div>
            
            <button
              className="btn btn-primary"
              onClick={addCustomModifier}
              disabled={!customModifier.name.trim()}
              style={{ marginTop: '0.5rem' }}
            >
              Add Custom {customModifier.isAdvantage ? 'Advantage' : 'Limitation'}
            </button>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredModifiers.map(mod => (
              <div
                key={mod.xmlId}
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onClick={() => {
                  // If sub-power modal is open, add to sub-power, otherwise add to main power
                  if (showSubPowerModal) {
                    addSubPowerModifier(mod);
                  } else {
                    addModifier(mod);
                  }
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--background-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{mod.display}</strong>
                  <span style={{ 
                    color: mod.isAdvantage ? 'green' : 'red',
                    fontWeight: 600,
                  }}>
                    {formatModifierValue(mod.baseCost)}
                    {mod.hasLevels && mod.lvlCost && ` (+${formatModifierValue(mod.lvlCost)}/lvl)`}
                  </span>
                </div>
                {mod.description && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {mod.description}
                  </div>
                )}
                {mod.hasOptions && mod.options && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Options: {mod.options.map(o => o.display).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Adder Selection Modal */}
      <Modal
        isOpen={showAdderModal}
        onClose={() => { setShowAdderModal(false); setShowCustomAdder(false); }}
        title={`Add Adder${selectedPowerDef ? ` - ${selectedPowerDef.display}` : ''}`}
        size="small"
      >
        {showCustomAdder ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label">Adder Name *</label>
              <input
                type="text"
                className="form-input"
                value={customAdder.name}
                onChange={e => setCustomAdder({ ...customAdder, name: e.target.value })}
                placeholder="e.g., Special Feature"
                autoFocus
              />
            </div>
            
            <div>
              <label className="form-label">Cost (Character Points)</label>
              <input
                type="number"
                className="form-input"
                value={customAdder.cost}
                onChange={e => setCustomAdder({ ...customAdder, cost: Math.max(1, parseInt(e.target.value) || 1) })}
                min={1}
              />
            </div>
            
            <div>
              <label className="form-label">Notes (optional)</label>
              <textarea
                className="form-input"
                value={customAdder.notes}
                onChange={e => setCustomAdder({ ...customAdder, notes: e.target.value })}
                placeholder="Description..."
                rows={2}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowCustomAdder(false)}
                style={{ flex: 1 }}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary"
                onClick={addCustomAdder}
                disabled={!customAdder.name.trim() || customAdder.cost <= 0}
                style={{ flex: 1 }}
              >
                Add Custom Adder
              </button>
            </div>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {/* Custom Adder option at top */}
            <div
              style={{
                padding: '0.75rem',
                borderBottom: '2px solid var(--border-color)',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                backgroundColor: 'rgba(var(--accent-rgb), 0.05)',
              }}
              onClick={() => setShowCustomAdder(true)}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--background-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(var(--accent-rgb), 0.05)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>➕ Custom Adder...</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Define your own
                </span>
              </div>
            </div>
            
            {availableAdders.length === 0 ? (
              <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No predefined adders available for this power.
              </div>
            ) : (
              availableAdders.map(adderDef => {
                const cost = adderDef.baseCost + (adderDef.lvlCost ? ` + ${adderDef.lvlCost}/lvl` : '');
                return (
                  <div
                    key={adderDef.xmlId}
                    style={{
                      padding: '0.75rem',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onClick={() => addAdder(adderDef)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--background-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{adderDef.display}</strong>
                      <span style={{ 
                        color: 'var(--accent-color)',
                        fontWeight: 600,
                      }}>
                        {cost} pts
                      </span>
                    </div>
                    {adderDef.exclusive && adderDef.excludes && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Exclusive (cannot combine with similar adders)
                      </div>
                    )}
                    {adderDef.includeInBase && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Adds to base damage
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
