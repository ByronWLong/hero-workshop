import { useState, useMemo } from 'react';
import type { Character, Equipment, Modifier, Adder, Power } from '@hero-workshop/shared';
import {
  ALL_POWERS,
  getPowerDefinition,
  calculatePowerBaseCost,
  calculateAdderCost,
  heroRoundCost,
  type PowerDefinition,
} from '@hero-workshop/shared';
import {
  ADVANTAGES,
  LIMITATIONS,
  formatModifierValue,
} from '@hero-workshop/shared';
import { Modal } from './Modal';

interface EquipmentTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Powers commonly used as equipment
const EQUIPMENT_POWER_CATEGORIES: Record<string, PowerDefinition[]> = {
  'Weapons': Object.values(ALL_POWERS).filter(p => 
    p.types.includes('ATTACK') && 
    ['ENERGYBLAST', 'HANDTOHANDATTACK', 'HANDKILLING', 'KILLINGATTACK', 'FLASH', 'ENTANGLE'].includes(p.xmlId)
  ),
  'Armor & Protection': Object.values(ALL_POWERS).filter(p => 
    p.types.includes('DEFENSE') ||
    ['FORCEFIELD', 'KBRESISTANCE', 'DAMAGENEGATION', 'DAMAGEREDUCTION', 'MISSILEDEFLECTION'].includes(p.xmlId)
  ),
  'Characteristic Boosts': Object.values(ALL_POWERS).filter(p => 
    ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN'].includes(p.xmlId)
  ),
  'Sensors & Detection': Object.values(ALL_POWERS).filter(p => 
    p.types.includes('SENSORY') ||
    ['ENHANCEDSENSES', 'CLAIRSENTIENCE', 'DETECT'].includes(p.xmlId)
  ),
  'Movement': Object.values(ALL_POWERS).filter(p => p.types.includes('MOVEMENT')),
  'Utility': Object.values(ALL_POWERS).filter(p => 
    ['LIFESUPPORT', 'IMAGES', 'INVISIBILITY', 'TELEKINESIS', 'HEALING'].includes(p.xmlId)
  ),
};

// Full power categories for sub-power editing (matching PowersTab)
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
  'Characteristic Powers': Object.values(ALL_POWERS).filter((p: PowerDefinition) => 
    ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN'].includes(p.xmlId)
  ),
  'Skill Levels': Object.values(ALL_POWERS).filter((p: PowerDefinition) => 
    ['COMBAT_LEVELS', 'MENTAL_COMBAT_LEVELS', 'SKILL_LEVELS', 'PENALTY_SKILL_LEVELS'].includes(p.xmlId)
  ),
};

// Focus limitations for equipment
const FOCUS_LIMITATIONS = Object.values(LIMITATIONS).filter(l => 
  l.xmlId.includes('FOCUS') || 
  ['OAF', 'OIF', 'IAF', 'IIF'].includes(l.xmlId) ||
  l.display.toLowerCase().includes('focus')
);

// All limitations for equipment modifiers
const ALL_LIMITATIONS_SORTED = Object.values(LIMITATIONS).sort((a, b) => a.display.localeCompare(b.display));
const ALL_ADVANTAGES_SORTED = Object.values(ADVANTAGES).sort((a, b) => a.display.localeCompare(b.display));

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

interface EquipmentPower {
  powerDef: PowerDefinition | null;
  levels: number;
  modifiers: SelectedModifier[];
  name: string;
  alias: string;
  subPowers?: Power[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Calculate STR damage in dice notation
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
    return `${fullDice + 1}d6-1`;
  }
}

export function EquipmentTab({ character, onUpdate }: EquipmentTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [isPowerMode, setIsPowerMode] = useState(false);
  const [isCompoundMode, setIsCompoundMode] = useState(false); // Compound power mode
  
  // Basic equipment form
  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    baseCost: 0,
    price: 0,
    weight: 0,
    carried: true,
  });
  
  // Power-based equipment form
  const [equipmentPower, setEquipmentPower] = useState<EquipmentPower>({
    powerDef: null,
    levels: 1,
    modifiers: [],
    name: '',
    alias: '',
  });

  // Sub-power editing state
  const [showSubPowerModal, setShowSubPowerModal] = useState(false);
  const [editingSubPower, setEditingSubPower] = useState<Power | null>(null);
  const [subPowerDef, setSubPowerDef] = useState<PowerDefinition | null>(null);
  const [subPowerFormData, setSubPowerFormData] = useState({
    name: '',
    alias: '',
    notes: '',
    levels: 1,
    selectedModifiers: [] as SelectedModifier[],
    adders: [] as Adder[],
    affectsPrimary: true,
    affectsTotal: true,
  });
  const [isEditingSubPowerModifier, setIsEditingSubPowerModifier] = useState(false);
  
  // Modifier modal
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [modifierSearchTerm, setModifierSearchTerm] = useState('');
  const [modifierType, setModifierType] = useState<'advantage' | 'limitation' | 'custom'>('limitation');
  
  // Custom modifier form
  const [customModifier, setCustomModifier] = useState({
    name: '',
    value: 0.25,
    isAdvantage: false,
    notes: '',
  });

  const equipment = character.equipment ?? [];
  const totalCost = equipment.reduce((sum, e) => sum + (e.realCost ?? e.baseCost ?? 0), 0);
  const totalWeight = equipment.filter((e) => e.carried).reduce((sum, e) => sum + (e.weight ?? 0), 0);

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
    const def = findPowerDefinition(power.type);
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
      'ENDURANCE_RESERVE': 'ENDURANCERESERVE',
    };
    const xmlId = typeMap[power.type] ?? power.type;
    return findPowerDefinition(xmlId);
  };

  const getAttackDamageDisplay = (power: Power): string | null => {
    const def = matchPowerToDefinition(power);
    if (!def?.doesDamage && !power.doesDamage && !power.killing) return null;
    
    const baseDice = power.levels ?? 1;
    const isKilling = def?.isKilling ?? power.killing;
    
    // Check if HTH attack (gets STR adds)
    const isHth = ['HANDTOHANDATTACK', 'HANDKILLING', 'KILLINGATTACK'].includes(def?.xmlId || '') ||
                  power.range === 'NO_RANGE' || power.range === 'SELF';
    
    // Check for No STR Bonus limitation
    const hasNoStrBonus = power.modifiers?.some(m => 
      m.id === 'NOSTRBONUS' || m.name.toLowerCase().includes('no str')
    );
    
    if (isHth && !hasNoStrBonus) {
      const strDamage = calculateStrDamage(charStr);
      if (isKilling) {
        return `${baseDice}d6K + ${strDamage} STR`;
      } else {
        return `${baseDice}d6 + ${strDamage} STR`;
      }
    }
    
    return isKilling ? `${baseDice}d6K` : `${baseDice}d6`;
  };

  const openAddModal = () => {
    setEditingEquipment(null);
    setIsPowerMode(false);
    setIsCompoundMode(false);
    setFormData({
      name: '',
      alias: '',
      notes: '',
      baseCost: 0,
      price: 0,
      weight: 0,
      carried: true,
    });
    setEquipmentPower({
      powerDef: null,
      levels: 1,
      modifiers: [],
      name: '',
      alias: '',
      subPowers: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: Equipment) => {
    setEditingEquipment(item);
    
    // Check if this equipment has associated power data
    const hasPowerData = item.activeCost !== undefined && item.activeCost > 0;
    const hasSubPowers = item.subPowers && item.subPowers.length > 0;
    const isCompound = hasSubPowers || item.xmlId === 'COMPOUNDPOWER' || item.xmlId === 'MULTIPOWER';
    
    setIsPowerMode(hasPowerData && !isCompound);
    setIsCompoundMode(isCompound);
    
    setFormData({
      name: item.name,
      alias: item.alias ?? '',
      notes: item.notes ?? '',
      baseCost: item.baseCost,
      price: item.price ?? 0,
      weight: item.weight ?? 0,
      carried: item.carried ?? true,
    });
    
    // Try to restore power definition from item if power-based
    let powerDef: PowerDefinition | null = null;
    if (item.xmlId) {
       powerDef = getPowerDefinition(item.xmlId) ?? null;
    }
    // For compound powers, set a compound power def
    if (isCompound && !powerDef) {
      powerDef = getPowerDefinition('COMPOUNDPOWER') ?? null;
    }
    
    let modifiers: SelectedModifier[] = [];
    if (item.modifiers) {
      modifiers = item.modifiers.map(m => ({
        xmlId: m.id,
        name: m.name,
        value: m.value,
        isAdvantage: m.isAdvantage,
        isLimitation: m.isLimitation,
        levels: m.levels,
        optionId: m.optionId,
        optionName: m.alias,
        notes: m.notes,
        adders: m.adders,
      }));
    }

    setEquipmentPower({
      powerDef,
      levels: item.levels ?? 1,
      modifiers,
      name: item.name,
      alias: item.alias ?? '',
      subPowers: item.subPowers,
    });
    
    setIsModalOpen(true);
  };

  /** Convert a single power equipment to a compound power by making the current power a component */
  const convertToCompound = () => {
    if (!equipmentPower.powerDef || isCompoundMode) return;
    
    // Create a sub-power from the current equipment power
    const costs = calculatePowerCosts();
    
    // Move all modifiers (advantages AND limitations) to the component
    const modifiers: Modifier[] = equipmentPower.modifiers
      .map(mod => ({
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
    
    const newSubPower: Power = {
      id: generateId(),
      name: equipmentPower.powerDef.display,
      alias: equipmentPower.name || equipmentPower.powerDef.display,
      type: equipmentPower.powerDef.xmlId as Power['type'],
      baseCost: costs.baseCost,
      activeCost: costs.activeCost,
      realCost: costs.realCost,
      levels: equipmentPower.levels,
      position: 0,
      endCost: costs.endCost,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      duration: equipmentPower.powerDef.duration,
      range: equipmentPower.powerDef.range as Power['range'],
      doesDamage: equipmentPower.powerDef.doesDamage,
      killing: equipmentPower.powerDef.isKilling,
    };
    
    // Compound wrapper starts with no modifiers - user can add shared limitations later
    setEquipmentPower({
      powerDef: getPowerDefinition('COMPOUNDPOWER') ?? null,
      levels: 0,
      modifiers: [],
      name: equipmentPower.name || 'Compound Power',
      alias: '',
      subPowers: [newSubPower],
    });
    
    setIsPowerMode(false);
    setIsCompoundMode(true);
  };

  const handlePowerTypeChange = (xmlId: string) => {
    const def = getPowerDefinition(xmlId);
    if (def) {
      // Auto-add OAF limitation if no focus exists
      const hasNoFocus = !equipmentPower.modifiers.some(m => 
        m.xmlId.includes('FOCUS') || ['OAF', 'OIF', 'IAF', 'IIF'].includes(m.xmlId)
      );
      
      let mods = equipmentPower.modifiers;
      if (hasNoFocus) {
        // Add OAF as default focus for equipment
        const oafDef = LIMITATIONS['OAF'] ?? Object.values(LIMITATIONS).find(l => l.xmlId === 'OAF' || l.display === 'OAF');
        if (oafDef) {
          mods = [{
            xmlId: oafDef.xmlId,
            name: oafDef.display,
            value: oafDef.baseCost,
            isAdvantage: false,
            isLimitation: true,
          }];
        }
      }
      
      setEquipmentPower({
        ...equipmentPower,
        powerDef: def,
        name: def.display,
        modifiers: mods,
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
    
    setEquipmentPower({
      ...equipmentPower,
      modifiers: [...equipmentPower.modifiers, newMod],
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
    
    if (isEditingSubPowerModifier) {
      setSubPowerFormData({
        ...subPowerFormData,
        selectedModifiers: [...subPowerFormData.selectedModifiers, newMod],
      });
    } else {
      setEquipmentPower({
        ...equipmentPower,
        modifiers: [...equipmentPower.modifiers, newMod],
      });
    }
    
    // Reset form and close modal
    setCustomModifier({ name: '', value: 0.25, isAdvantage: false, notes: '' });
    setShowModifierModal(false);
  };

  const removeModifier = (index: number) => {
    setEquipmentPower({
      ...equipmentPower,
      modifiers: equipmentPower.modifiers.filter((_, i) => i !== index),
    });
  };

  const updateModifierLevels = (index: number, levels: number) => {
    const mods = [...equipmentPower.modifiers];
    const mod = mods[index];
    if (!mod) return;
    
    const modDef = ADVANTAGES[mod.xmlId] ?? LIMITATIONS[mod.xmlId];
    
    if (modDef && modDef.hasLevels && modDef.lvlCost) {
      mod.levels = levels;
      mod.value = modDef.baseCost + (modDef.lvlCost * (levels - 1));
    }
    
    setEquipmentPower({ ...equipmentPower, modifiers: mods });
  };

  const calculatePowerCosts = () => {
    if (!equipmentPower.powerDef) {
      return { baseCost: 0, activeCost: 0, realCost: 0, endCost: 0 };
    }

    // Handle compound powers (sum of children)
    if (['COMPOUNDPOWER', 'MULTIPOWER'].includes(equipmentPower.powerDef.xmlId)) {
        const subPowers = equipmentPower.subPowers || [];
        const totalReal = subPowers.reduce((sum, p) => sum + (p.realCost ?? 0), 0);
        const totalActive = subPowers.reduce((sum, p) => sum + (p.activeCost ?? 0), 0);
        return { baseCost: totalActive, activeCost: totalActive, realCost: totalReal, endCost: 0 };
    }

    const baseCost = calculatePowerBaseCost(equipmentPower.powerDef, equipmentPower.levels);
    
    const advantageTotal = equipmentPower.modifiers
      .filter(m => m.isAdvantage)
      .reduce((sum, m) => sum + m.value, 0);
    
    const limitationTotal = equipmentPower.modifiers
      .filter(m => m.isLimitation)
      .reduce((sum, m) => sum + Math.abs(m.value), 0);
    
    const activeCost = Math.ceil(baseCost * (1 + advantageTotal));
    const realCost = limitationTotal > 0 
      ? Math.ceil(activeCost / (1 + limitationTotal))
      : activeCost;
    
    const endCost = equipmentPower.powerDef.usesEnd !== false ? Math.ceil(activeCost / 10) : 0;
    
    return { baseCost, activeCost, realCost, endCost };
  };

  const calculateSubPowerCosts = () => {
    if (!subPowerDef) {
      return { baseCost: 0, activeCost: 0, realCost: 0, endCost: 0 };
    }

    const powerBaseCost = calculatePowerBaseCost(subPowerDef, subPowerFormData.levels);
    const adderCost = calculateAdderCost(subPowerFormData.adders);
    const baseCost = powerBaseCost + adderCost;

    const advantageTotal = subPowerFormData.selectedModifiers
      .filter(m => m.isAdvantage)
      .reduce((sum, m) => sum + m.value, 0);

    const limitationTotal = subPowerFormData.selectedModifiers
      .filter(m => m.isLimitation)
      .reduce((sum, m) => sum + Math.abs(m.value), 0);
    
    const activeCost = Math.ceil(baseCost * (1 + advantageTotal));
    const realCost = limitationTotal > 0 
      ? Math.ceil(activeCost / (1 + limitationTotal))
      : activeCost;
    
    const endCost = subPowerDef.usesEnd !== false ? Math.ceil(activeCost / 10) : 0;
    
    return { baseCost, activeCost, realCost, endCost };
  };

  const openAddSubPowerModal = () => {
    setSubPowerFormData({
      name: '',
      alias: '',
      levels: 1,
      notes: '',
      adders: [],
      selectedModifiers: [],
      affectsPrimary: true,
      affectsTotal: true,
    });
    setSubPowerDef(null);
    setEditingSubPower(null);
    setIsEditingSubPowerModifier(true); // Flag to indicate we are working on sub-power context (reusing for modal trigger check, but maybe a separate flag is better)
    // Actually setIsEditingSubPowerModifier is for the modifier modal.
    setIsEditingSubPowerModifier(true);
    setShowSubPowerModal(true);
  };

  const openEditSubPowerModal = (power: Power) => {
    const def = power.type !== 'GENERIC' && power.type !== 'COMPOUNDPOWER' && power.type !== 'LIST'
      ? getPowerDefinition(power.type)
      : undefined;
      
    const selectedModifiers: SelectedModifier[] = (power.modifiers || []).map(m => ({
      xmlId: m.id,
      name: m.name,
      optionName: m.alias,
      value: m.value,
      isAdvantage: m.isAdvantage,
      isLimitation: m.isLimitation,
      levels: m.levels,
      notes: m.notes,
      adders: m.adders,
    }));

    setSubPowerFormData({
      name: power.name,
      alias: power.alias || '',
      levels: power.levels || 1,
      notes: power.notes || '',
      adders: power.adders || [],
      selectedModifiers,
      affectsPrimary: power.affectsPrimary ?? true,
      affectsTotal: power.affectsTotal ?? true,
    });
    setSubPowerDef(def || null);
    setEditingSubPower(power);
    setIsEditingSubPowerModifier(true);
    setShowSubPowerModal(true);
  };

  const saveSubPower = () => {
    const costs = calculateSubPowerCosts();
    
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
      baseCost: costs.baseCost,
      activeCost: costs.activeCost,
      realCost: costs.realCost,
      levels: subPowerFormData.levels,
      position: editingSubPower?.position ?? (equipmentPower.subPowers?.length || 0),
      effectDice: subPowerDef?.doesDamage ? `${subPowerFormData.levels}d6` : editingSubPower?.effectDice,
      endCost: costs.endCost,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      duration: subPowerDef?.duration ?? editingSubPower?.duration,
      range: (subPowerDef?.range ?? editingSubPower?.range) as Power['range'],
      doesDamage: subPowerDef?.doesDamage ?? editingSubPower?.doesDamage,
      killing: subPowerDef?.isKilling ?? editingSubPower?.killing,
      affectsPrimary: subPowerFormData.affectsPrimary,
      affectsTotal: subPowerFormData.affectsTotal,
    };

    let updatedSubPowers = equipmentPower.subPowers ? [...equipmentPower.subPowers] : [];
    if (editingSubPower) {
      updatedSubPowers = updatedSubPowers.map(p => p.id === editingSubPower.id ? newSubPower : p);
    } else {
      updatedSubPowers.push(newSubPower);
    }
    
    setEquipmentPower({ ...equipmentPower, subPowers: updatedSubPowers });
    setShowSubPowerModal(false);
  };

  const deleteSubPower = (subPowerId: string) => {
    setEquipmentPower({
      ...equipmentPower,
      subPowers: (equipmentPower.subPowers || []).filter(p => p.id !== subPowerId),
    });
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
    setShowModifierModal(false);
  };

  const removeSubPowerModifier = (index: number) => {
    setSubPowerFormData({
      ...subPowerFormData,
      selectedModifiers: subPowerFormData.selectedModifiers.filter((_, i) => i !== index),
    });
  };

  const updateSubPowerModifierLevels = (index: number, levels: number) => {
    const mods = [...subPowerFormData.selectedModifiers];
    const mod = mods[index];
    if (!mod) return;
    
    const modDef = ADVANTAGES[mod.xmlId] ?? LIMITATIONS[mod.xmlId];
    
    if (modDef && modDef.hasLevels && modDef.lvlCost) {
      mod.levels = levels;
      mod.value = modDef.baseCost + (modDef.lvlCost * (levels - 1));
    }
    
    setSubPowerFormData({ ...subPowerFormData, selectedModifiers: mods });
  };

  const handleSave = () => {
    let newEquipment: Equipment;
    
    if ((isPowerMode || isCompoundMode) && equipmentPower.powerDef) {
      const costs = calculatePowerCosts();
      
      const modifiers: Modifier[] = equipmentPower.modifiers.map(mod => ({
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
      
      // Calculate total cost for compound powers (sum of all component real costs)
      let totalBaseCost = costs.baseCost;
      let totalActiveCost = costs.activeCost;
      let totalRealCost = costs.realCost;
      
      if (isCompoundMode && equipmentPower.subPowers && equipmentPower.subPowers.length > 0) {
        // For compound powers, sum up all sub-power costs (modifiers are on components, not compound)
        totalBaseCost = equipmentPower.subPowers.reduce((sum, p) => sum + (p.baseCost || 0), 0);
        totalActiveCost = equipmentPower.subPowers.reduce((sum, p) => sum + (p.activeCost || 0), 0);
        totalRealCost = equipmentPower.subPowers.reduce((sum, p) => sum + (p.realCost || 0), 0);
      }
      
      newEquipment = {
        id: editingEquipment?.id ?? generateId(),
        name: equipmentPower.name || equipmentPower.powerDef.display,
        alias: undefined,
        notes: formData.notes || undefined,
        baseCost: totalBaseCost,
        activeCost: totalActiveCost,
        realCost: totalRealCost,
        levels: equipmentPower.levels,
        position: editingEquipment?.position ?? equipment.length,
        price: formData.price || undefined,
        weight: formData.weight || undefined,
        carried: formData.carried,
        endCost: costs.endCost,
        modifiers,
        subPowers: equipmentPower.subPowers,
        // Store the xmlId to identify this as a compound power
        xmlId: isCompoundMode ? 'COMPOUNDPOWER' : equipmentPower.powerDef.xmlId,
      };
    } else {
      newEquipment = {
        id: editingEquipment?.id ?? generateId(),
        name: formData.name || 'Equipment',
        alias: formData.alias || undefined,
        notes: formData.notes || undefined,
        baseCost: formData.baseCost,
        realCost: formData.baseCost,
        levels: 1,
        position: editingEquipment?.position ?? equipment.length,
        price: formData.price || undefined,
        weight: formData.weight || undefined,
        carried: formData.carried,
      };
    }

    let updatedEquipment: Equipment[];
    if (editingEquipment) {
      updatedEquipment = equipment.map((e) => (e.id === editingEquipment.id ? newEquipment : e));
    } else {
      updatedEquipment = [...equipment, newEquipment];
    }

    onUpdate({ ...character, equipment: updatedEquipment });
    setIsModalOpen(false);
  };

  const handleDelete = (equipmentId: string) => {
    onUpdate({
      ...character,
      equipment: equipment.filter((e) => e.id !== equipmentId),
    });
  };

  const toggleCarried = (equipmentId: string) => {
    onUpdate({
      ...character,
      equipment: equipment.map((e) =>
        e.id === equipmentId ? { ...e, carried: !e.carried } : e
      ),
    });
  };

  /**
   * Get damage display for weapon equipment
   */
  const getEquipmentDamageDisplay = (item: Equipment): string | null => {
    if (!item.activeCost || item.activeCost === 0) return null;
    
    const levels = item.levels ?? 1;
    
    // Check if it's a killing attack based on name or modifiers
    const isKilling = item.name.toLowerCase().includes('killing') ||
                      item.modifiers?.some(m => m.name.toLowerCase().includes('killing'));
    
    // Check if it's an HTH weapon (no range or has STR minimum)
    const isHthWeapon = item.modifiers?.some(m => 
      m.name.toLowerCase().includes('str min') ||
      m.name.toLowerCase().includes('no range')
    ) || !item.modifiers?.some(m => m.name.toLowerCase().includes('range'));
    
    // Check for No STR Bonus
    const hasNoStrBonus = item.modifiers?.some(m => 
      m.id === 'NOSTRBONUS' || m.name.toLowerCase().includes('no str')
    );
    
    if (isHthWeapon && !hasNoStrBonus) {
      const strDamage = calculateStrDamage(charStr);
      if (isKilling) {
        return `${levels}d6K + ${strDamage} STR`;
      } else {
        return `${levels}d6 + ${strDamage} STR`;
      }
    }
    
    return isKilling ? `${levels}d6K` : `${levels}d6`;
  };

  const filteredModifiers = useMemo(() => {
    if (modifierType === 'custom') return []; // Custom tab doesn't use the list
    const list = modifierType === 'advantage' ? ALL_ADVANTAGES_SORTED : ALL_LIMITATIONS_SORTED;
    if (!modifierSearchTerm) return list;
    
    const search = modifierSearchTerm.toLowerCase();
    return list.filter(m => 
      m.display.toLowerCase().includes(search) ||
      m.xmlId.toLowerCase().includes(search) ||
      m.description?.toLowerCase().includes(search)
    );
  }, [modifierType, modifierSearchTerm]);

  const powerCosts = calculatePowerCosts();

  if (equipment.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎒</div>
        <div className="empty-state-title">No Equipment</div>
        <p>This character has no equipment yet.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Equipment
        </button>
      </div>
    );
  }

  return (
    <div className="equipment-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            Equipment
            {totalCost > 0 && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}> ({totalCost} pts)</span>}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Carried: {totalWeight.toFixed(1)} kg
            </span>
            <button className="btn btn-primary" onClick={openAddModal}>
              Add Equipment
            </button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>📦</th>
              <th style={{ textAlign: 'center', width: '50px' }}>END</th>
              <th>Item</th>
              <th style={{ textAlign: 'right', width: '60px' }}>Active</th>
              <th style={{ textAlign: 'right', width: '60px' }}>Real</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => {
              const damageDisplay = getEquipmentDamageDisplay(item);
              return (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.carried ?? true}
                      onChange={() => toggleCarried(item.id)}
                      title={item.carried ? 'Carried' : 'Not carried'}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {item.endCost ?? 0}
                  </td>
                  <td>
                    <div>
                      <strong>{item.name}:</strong>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {item.alias || '(no description)'}
                      </span>
                    </div>
                    {damageDisplay && (
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--danger-color)', 
                        fontWeight: 600,
                        marginTop: '0.25rem'
                      }}>
                        ⚔️ {damageDisplay}
                      </div>
                    )}
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {item.modifiers.map(m => `${m.name} (${formatModifierValue(m.value)})`).join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                        {item.notes}
                      </div>
                    )}
                    {item.subPowers && item.subPowers.length > 0 && (
                      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                        {item.subPowers.map((sub, idx) => {
                          const subDamage = getAttackDamageDisplay(sub);
                          const subPowerDef = getPowerDefinition(sub.type);
                          const powerDisplayName = subPowerDef?.display || sub.type;
                          // Check if it's a characteristic power
                          const characteristicTypes = new Set([
                            'STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE',
                            'OCV', 'DCV', 'OMCV', 'DMCV',
                            'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN',
                            'RUNNING', 'SWIMMING', 'LEAPING'
                          ]);
                          const isCharPower = characteristicTypes.has(sub.type);
                          const subDisplayName = isCharPower 
                            ? `${(sub.levels ?? 0) >= 0 ? '+' : ''}${sub.levels ?? 0} ${sub.type}`
                            : (sub.name || powerDisplayName);
                          return (
                            <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                               <span style={{ color: 'var(--secondary-color)', marginRight: '0.25rem' }}>•</span>
                               <strong>{subDisplayName}:</strong> {!isCharPower && sub.alias}
                               {sub.activeCost && <span style={{ color: 'var(--text-secondary)' }}> ({sub.activeCost} AP)</span>}
                               {subDamage && <span style={{ color: 'var(--danger-color)', fontWeight: 600, marginLeft: '0.5rem' }}>{subDamage}</span>}
                               {sub.modifiers && sub.modifiers.length > 0 && (
                                 <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>[{sub.modifiers.map(m => m.name).join(', ')}]</span>
                               )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {item.activeCost && item.activeCost !== item.realCost ? item.activeCost : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {item.realCost ?? item.baseCost ?? 0}
                  </td>
                  <td>
                    <div className="item-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => openEditModal(item)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon-small"
                        onClick={() => handleDelete(item.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEquipment ? 'Edit Equipment' : 'Add Equipment'}
        size="large"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            {isPowerMode && !isCompoundMode && (
              <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
                <span>Base: {powerCosts.baseCost}</span>
                <span>Active: {powerCosts.activeCost}</span>
                <span style={{ fontWeight: 600 }}>Real: {powerCosts.realCost} pts</span>
                <span>END: {powerCosts.endCost}</span>
              </div>
            )}
            {isCompoundMode && equipmentPower.subPowers && equipmentPower.subPowers.length > 0 && (
              <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
                <span>Components: {equipmentPower.subPowers.length}</span>
                <span>Active: {equipmentPower.subPowers.reduce((sum, p) => sum + (p.activeCost || 0), 0)}</span>
                <span style={{ fontWeight: 600 }}>
                  Real: {equipmentPower.subPowers.reduce((sum, p) => sum + (p.realCost || 0), 0)} pts
                </span>
              </div>
            )}
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingEquipment ? 'Save Changes' : 'Add Equipment'}
            </button>
          </div>
        }
      >
        {/* Mode Toggle */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn ${!isPowerMode && !isCompoundMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setIsPowerMode(false); setIsCompoundMode(false); }}
          >
            Simple Item
          </button>
          <button
            className={`btn ${isPowerMode && !isCompoundMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setIsPowerMode(true); setIsCompoundMode(false); }}
          >
            Power-Based
          </button>
          <button
            className={`btn ${isCompoundMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { 
              setIsPowerMode(true); 
              setIsCompoundMode(true);
              // Set up compound power if not already
              if (!equipmentPower.powerDef || equipmentPower.powerDef.xmlId !== 'COMPOUNDPOWER') {
                const compoundDef = getPowerDefinition('COMPOUNDPOWER');
                if (compoundDef) {
                  setEquipmentPower({
                    ...equipmentPower,
                    powerDef: compoundDef,
                    subPowers: equipmentPower.subPowers || [],
                  });
                }
              }
            }}
          >
            Compound Power
          </button>
          {/* Convert to Compound button - only show for single power equipment */}
          {isPowerMode && !isCompoundMode && equipmentPower.powerDef && equipmentPower.powerDef.xmlId !== 'COMPOUNDPOWER' && (
            <button
              className="btn btn-secondary"
              style={{ marginLeft: 'auto' }}
              onClick={convertToCompound}
              title="Convert this power to a compound power with the current power as the first component"
            >
              Convert to Compound
            </button>
          )}
        </div>

        {!isPowerMode && !isCompoundMode ? (
          // Simple Equipment Form
          <div>
            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sword, Armor, Flashlight"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Display Name (optional)</label>
              <input
                type="text"
                className="form-input"
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                placeholder={formData.name || 'Custom display name'}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Weight (kg)</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step={0.1}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Price ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Character Point Cost</label>
              <input
                type="number"
                className="form-input"
                value={formData.baseCost}
                onChange={(e) => setFormData({ ...formData, baseCost: parseInt(e.target.value) || 0 })}
                min={0}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Only enter a cost if this equipment is purchased with character points
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.carried}
                  onChange={(e) => setFormData({ ...formData, carried: e.target.checked })}
                />
                <span>Currently Carried</span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Description, special properties, etc."
                rows={3}
              />
            </div>
          </div>
        ) : isCompoundMode ? (
          // Compound Power Equipment Form
          <div>
            {/* Compound Properties at Top */}
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'var(--background-secondary)', 
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                Compound Power Properties
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Item Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={equipmentPower.name}
                    onChange={e => setEquipmentPower({ ...equipmentPower, name: e.target.value })}
                    placeholder="e.g., Magic Sword, Power Gauntlet"
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                    <label className="form-label">Weight (kg)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                      min={0}
                      step={0.1}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.75rem' }}>
                      <input
                        type="checkbox"
                        checked={formData.carried}
                        onChange={(e) => setFormData({ ...formData, carried: e.target.checked })}
                      />
                      <span>Carried</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Description, special properties, etc."
                  rows={2}
                />
              </div>
            </div>
            
            {/* Components Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
                  Component Powers ({equipmentPower.subPowers?.length || 0})
                </h4>
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={openAddSubPowerModal}
                >
                  + Add Component
                </button>
              </div>
              
              {(!equipmentPower.subPowers || equipmentPower.subPowers.length === 0) ? (
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: 'var(--text-secondary)',
                  border: '2px dashed var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--background-secondary)',
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</div>
                  <div>No component powers yet</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Add powers like attacks, defenses, or movement to this item
                  </div>
                </div>
              ) : (
                <div style={{ 
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {equipmentPower.subPowers.map((sub, idx) => {
                    const characteristicTypes = new Set(['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'RUNNING', 'SWIMMING', 'LEAPING']);
                    const isCharPower = characteristicTypes.has(sub.type);
                    const subDisplayName = isCharPower 
                      ? `${(sub.levels ?? 0) >= 0 ? '+' : ''}${sub.levels ?? 0} ${sub.type}` 
                      : (sub.alias || sub.name || getPowerDefinition(sub.type)?.display || sub.type);
                    return (
                    <div 
                      key={sub.id}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: idx % 2 === 0 ? 'var(--background-primary)' : 'var(--background-secondary)',
                        borderBottom: idx < equipmentPower.subPowers!.length - 1 ? '1px solid var(--border-color)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>
                          {subDisplayName}
                          {!isCharPower && <span style={{ 
                            marginLeft: '0.5rem', 
                            fontSize: '0.75rem', 
                            color: 'var(--text-secondary)',
                            fontWeight: 'normal',
                          }}>
                            ({getPowerDefinition(sub.type)?.display || sub.type})
                          </span>}
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          gap: '1rem', 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          marginTop: '0.25rem',
                        }}>
                          <span>Active: {sub.activeCost || 0}</span>
                          <span>Real: {sub.realCost || 0}</span>
                          {sub.effectDice && <span>Dmg: {sub.effectDice}</span>}
                        </div>
                        {sub.modifiers && sub.modifiers.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {sub.modifiers.map(m => m.name).join(', ')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => openEditSubPowerModal(sub)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => deleteSubPower(sub.id)}
                          title="Delete"
                          style={{ color: 'var(--danger-color)' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );})}
                </div>
              )}
              
              {/* Cost Summary */}
              {equipmentPower.subPowers && equipmentPower.subPowers.length > 0 && (
                <div style={{ 
                  marginTop: '1rem',
                  padding: '0.75rem', 
                  backgroundColor: 'var(--background-secondary)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Active Cost:</span>
                    <span>{equipmentPower.subPowers.reduce((sum, p) => sum + (p.activeCost || 0), 0)}</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    borderTop: '1px solid var(--border-color)', 
                    marginTop: '0.25rem', 
                    paddingTop: '0.25rem',
                    fontWeight: 600,
                  }}>
                    <span>Total Real Cost:</span>
                    <span>{equipmentPower.subPowers.reduce((sum, p) => sum + (p.realCost || 0), 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Power-Based Equipment Form
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <div className="form-group">
                <label className="form-label">Power Type</label>
                {!equipmentPower.subPowers || equipmentPower.subPowers.length === 0 ? (
                  <select
                    className="form-select"
                    value={equipmentPower.powerDef?.xmlId ?? ''}
                    onChange={e => handlePowerTypeChange(e.target.value)}
                  >
                    <option value="">-- Select Power --</option>
                    {Object.entries(EQUIPMENT_POWER_CATEGORIES).map(([category, categoryPowers]) => (
                      categoryPowers.length > 0 && (
                        <optgroup key={category} label={category}>
                          {categoryPowers
                            .sort((a, b) => a.display.localeCompare(b.display))
                            .map(power => (
                              <option key={power.xmlId} value={power.xmlId}>
                                {power.display} ({power.lvlCost}/level)
                              </option>
                            ))}
                        </optgroup>
                      )
                    ))}
                  </select>
                ) : (
                  <div className="form-input" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-secondary)' }}>
                     {equipmentPower.powerDef?.xmlId === 'MULTIPOWER' ? 'Multi-Power' : 'Compound Power'}
                  </div>
                )}
                {equipmentPower.powerDef && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    {equipmentPower.powerDef.description}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Item Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={equipmentPower.name}
                  onChange={e => setEquipmentPower({ ...equipmentPower, name: e.target.value })}
                  placeholder="e.g., Laser Pistol, Power Armor"
                />
              </div>

              {/* Hide Dice/Levels for fixed-cost powers (lvlCost === 0) */}
              {equipmentPower.powerDef && equipmentPower.powerDef.lvlCost > 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Dice / Levels</label>
                  <input
                    type="number"
                    className="form-input"
                    value={equipmentPower.levels}
                    onChange={e => setEquipmentPower({ ...equipmentPower, levels: parseInt(e.target.value) || 1 })}
                    min={1}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost per Level</label>
                  <input
                    type="number"
                    className="form-input"
                    value={equipmentPower.powerDef?.lvlCost ?? 0}
                    disabled
                  />
                </div>
              </div>
              )}
              
              {/* Pool Size for Multipower */}
              {equipmentPower.powerDef?.xmlId === 'MULTIPOWER' && (
                <div className="form-group">
                  <label className="form-label">Reserve / Pool Size</label>
                  <input
                    type="number"
                    className="form-input"
                    value={equipmentPower.levels} // Multipower usually stores reserve in levels or baseCost
                    onChange={e => setEquipmentPower({ ...equipmentPower, levels: parseInt(e.target.value) || 0 })}
                  />
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Weight (kg)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                    min={0}
                    step={0.1}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.carried}
                      onChange={(e) => setFormData({ ...formData, carried: e.target.checked })}
                    />
                    <span>Carried</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Description, special properties, etc."
                  rows={2}
                />
              </div>
            </div>

            <div>
              {/* Modifiers */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Modifiers (Focus, etc.)</label>
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
                
                {/* Quick Focus buttons */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  {FOCUS_LIMITATIONS.slice(0, 4).map(focus => (
                    <button
                      key={focus.xmlId}
                      className="btn btn-sm btn-secondary"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => addModifier(focus)}
                      disabled={equipmentPower.modifiers.some(m => m.xmlId === focus.xmlId)}
                    >
                      {focus.display} ({formatModifierValue(focus.baseCost)})
                    </button>
                  ))}
                </div>
                
                {equipmentPower.modifiers.length === 0 ? (
                  <div style={{ 
                    padding: '1rem', 
                    textAlign: 'center', 
                    color: 'var(--text-secondary)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                  }}>
                    Equipment should have a Focus limitation (OAF, OIF, IAF, or IIF)
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.5rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}>
                    {/* Advantages first */}
                    {equipmentPower.modifiers
                      .filter(m => m.isAdvantage)
                      .map((mod, idx) => {
                        const realIndex = equipmentPower.modifiers.indexOf(mod);
                        const modDef = ADVANTAGES[mod.xmlId];
                        return (
                          <div 
                            key={`${mod.xmlId}-${idx}`}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              padding: '0.5rem',
                              backgroundColor: 'rgba(0, 200, 0, 0.1)',
                              borderRadius: '4px',
                              border: '1px solid rgba(0, 200, 0, 0.3)',
                              fontSize: '0.875rem',
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
                                style={{ width: '50px' }}
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
                    
                    {/* Limitations */}
                    {equipmentPower.modifiers
                      .filter(m => m.isLimitation)
                      .map((mod, idx) => {
                        const realIndex = equipmentPower.modifiers.indexOf(mod);
                        const modDef = LIMITATIONS[mod.xmlId];
                        return (
                          <div 
                            key={`${mod.xmlId}-${idx}`}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem',
                              padding: '0.5rem',
                              backgroundColor: 'rgba(200, 0, 0, 0.1)',
                              borderRadius: '4px',
                              border: '1px solid rgba(200, 0, 0, 0.3)',
                              fontSize: '0.875rem',
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
                                style={{ width: '50px' }}
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

              {/* Complex Power Components (Sub-powers) */}
              {(equipmentPower.powerDef?.xmlId === 'COMPOUNDPOWER' || equipmentPower.powerDef?.xmlId === 'MULTIPOWER') && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>Components</label>
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={openAddSubPowerModal}
                    >
                      + Add Component
                    </button>
                  </div>

                  {(!equipmentPower.subPowers || equipmentPower.subPowers.length === 0) ? (
                    <div style={{ 
                      padding: '1rem', 
                      textAlign: 'center', 
                      color: 'var(--text-secondary)',
                      border: '1px dashed var(--border-color)',
                      borderRadius: '4px',
                    }}>
                      No components added to this compound power.
                    </div>
                  ) : (
                    <div style={{ 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '4px',
                      padding: '0.5rem',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      backgroundColor: 'var(--background-secondary)'
                    }}>
                      {equipmentPower.subPowers.map((sub, idx) => {
                        const characteristicTypes = new Set(['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'RUNNING', 'SWIMMING', 'LEAPING']);
                        const isCharPower = characteristicTypes.has(sub.type);
                        const subDisplayName = isCharPower 
                          ? `${(sub.levels ?? 0) >= 0 ? '+' : ''}${sub.levels ?? 0} ${sub.type}` 
                          : (sub.alias || sub.name || getPowerDefinition(sub.type)?.display || sub.type);
                        return (
                          <div key={sub.id || idx} style={{ 
                            fontSize: '0.85rem', 
                            marginBottom: '0.5rem', 
                            borderBottom: '1px dashed var(--border-color)', 
                            paddingBottom: '0.5rem',
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'flex-start'
                          }}>
                             <div style={{ flex: 1 }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <strong>{subDisplayName}</strong>
                                 <span>{sub.realCost} pts</span>
                               </div>
                               {!isCharPower && <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                   <span>{sub.name}</span>
                                   {(sub.levels || sub.effectDice) && <span>• {sub.levels ? `${sub.levels}d6` : sub.effectDice}</span>}
                                   <span>• Act: {sub.activeCost}</span>
                               </div>}
                               {isCharPower && <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                   <span>Act: {sub.activeCost}</span>
                               </div>}
                               {sub.modifiers && sub.modifiers.length > 0 && (
                                 <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                   {sub.modifiers.map(m => m.name).join(', ')}
                                 </div>
                               )}
                             </div>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                               <button 
                                 className="btn-icon-small"
                                 onClick={() => openEditSubPowerModal(sub)}
                                 title="Edit"
                               >
                                 ✏️
                               </button>
                               <button 
                                 className="btn-icon-small"
                                 onClick={() => deleteSubPower(sub.id)}
                                 title="Delete"
                                 style={{ color: 'var(--danger-color)' }}
                               >
                                 🗑️
                               </button>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Cost Calculation */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Cost Calculation</label>
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: 'var(--background-secondary)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                }}>
                  <div>Base: {equipmentPower.powerDef?.lvlCost ?? 0} × {equipmentPower.levels} = {powerCosts.baseCost}</div>
                  {equipmentPower.modifiers.filter(m => m.isAdvantage).length > 0 && (
                    <div style={{ color: 'green' }}>
                      Adv: +{equipmentPower.modifiers.filter(m => m.isAdvantage).reduce((s, m) => s + m.value, 0).toFixed(2)}
                    </div>
                  )}
                  {equipmentPower.modifiers.filter(m => m.isLimitation).length > 0 && (
                    <div style={{ color: 'red' }}>
                      Lim: {equipmentPower.modifiers.filter(m => m.isLimitation).reduce((s, m) => s + m.value, 0).toFixed(2)}
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
                    <strong>Active: {powerCosts.activeCost} | Real: {powerCosts.realCost}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Sub-Power Edit Modal (for compound powers in equipment) */}
      <Modal
        isOpen={showSubPowerModal}
        onClose={() => setShowSubPowerModal(false)}
        title={editingSubPower ? 'Edit Component Power' : 'Add Component Power'}
        size="large"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', marginRight: 'auto', display: 'flex', gap: '1rem' }}>
              {subPowerDef && (
                <>
                  <span>Base: {calculatePowerBaseCost(subPowerDef, subPowerFormData.levels)}</span>
                  <span>Active: {heroRoundCost(calculatePowerBaseCost(subPowerDef, subPowerFormData.levels) * (1 + subPowerFormData.selectedModifiers.filter(m => m.isAdvantage).reduce((s, m) => s + m.value, 0)))}</span>
                </>
              )}
            </div>
            <button className="btn btn-secondary" onClick={() => setShowSubPowerModal(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveSubPower}>
              {editingSubPower ? 'Save Changes' : 'Add Component'}
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
            
            {/* Affects Primary/Total checkboxes */}
            <div className="form-group">
              <label className="form-label">Stat Contribution</label>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={subPowerFormData.affectsPrimary}
                    onChange={e => setSubPowerFormData({ ...subPowerFormData, affectsPrimary: e.target.checked })}
                  />
                  Affects Primary Stats
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={subPowerFormData.affectsTotal}
                    onChange={e => setSubPowerFormData({ ...subPowerFormData, affectsTotal: e.target.checked })}
                  />
                  Affects Total
                </label>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Uncheck &quot;Affects Primary&quot; for independent powers (e.g., container STR) that shouldn&apos;t add to character stats.
              </div>
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
                    setIsEditingSubPowerModifier(true);
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
                      {(ADVANTAGES[mod.xmlId]?.hasLevels || LIMITATIONS[mod.xmlId]?.hasLevels) && (
                        <input
                          type="number"
                          value={mod.levels ?? 1}
                          onChange={e => updateSubPowerModifierLevels(index, parseInt(e.target.value) || 1)}
                          min={1}
                          style={{ width: '50px', marginRight: '0.5rem' }}
                          className="form-input"
                        />
                      )}
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
              className={`btn ${modifierType === 'limitation' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setModifierType('limitation')}
            >
              Limitations ({ALL_LIMITATIONS_SORTED.length})
            </button>
            <button
              className={`btn ${modifierType === 'advantage' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setModifierType('advantage')}
            >
              Advantages ({ALL_ADVANTAGES_SORTED.length})
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
              <label className="form-label">Value (absolute)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select
                  className="form-input"
                  value={customModifier.value}
                  onChange={e => setCustomModifier({ ...customModifier, value: parseFloat(e.target.value) })}
                  style={{ flex: 1 }}
                >
                  <option value="0.25">+¼ / -¼</option>
                  <option value="0.5">+½ / -½</option>
                  <option value="0.75">+¾ / -¾</option>
                  <option value="1">+1 / -1</option>
                  <option value="1.25">+1¼ / -1¼</option>
                  <option value="1.5">+1½ / -1½</option>
                  <option value="1.75">+1¾ / -1¾</option>
                  <option value="2">+2 / -2</option>
                  <option value="2.5">+2½ / -2½</option>
                  <option value="3">+3 / -3</option>
                </select>
                <span style={{ 
                  color: customModifier.isAdvantage ? 'green' : 'red',
                  fontWeight: 600,
                  minWidth: '40px',
                }}>
                  {customModifier.isAdvantage ? '+' : '-'}{formatModifierValue(customModifier.value)}
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
                onClick={() => isEditingSubPowerModifier ? addSubPowerModifier(mod) : addModifier(mod)}
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
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
