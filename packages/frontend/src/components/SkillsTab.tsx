import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Character, Skill, SkillType, CharacteristicType, Adder, SkillEnhancerType } from '@hero-workshop/shared';
import { Modal } from './Modal';

// Mapping of skill types to their associated enhancer
const SKILL_TO_ENHANCER_MAP: Record<string, SkillEnhancerType> = {
  'PROFESSIONAL_SKILL': 'JACK_OF_ALL_TRADES',
  'PS': 'JACK_OF_ALL_TRADES',
  'KNOWLEDGE_SKILL': 'SCHOLAR',
  'KS': 'SCHOLAR',
  'SCIENCE_SKILL': 'SCIENTIST',
  'SS': 'SCIENTIST',
  'LANGUAGE': 'LINGUIST',
  'AREA_KNOWLEDGE': 'TRAVELER',
  'AK': 'TRAVELER',
  'CITY_KNOWLEDGE': 'TRAVELER',
  'CK': 'TRAVELER',
};

interface SkillsTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const SKILL_TYPES: { value: SkillType; label: string }[] = [
  { value: 'CHARACTERISTIC_BASED', label: 'Characteristic-Based' },
  { value: 'BACKGROUND', label: 'Background Skill' },
  { value: 'COMBAT', label: 'Combat Skill' },
  { value: 'KNOWLEDGE', label: 'Knowledge Skill' },
  { value: 'LANGUAGE', label: 'Language' },
  { value: 'PROFESSIONAL', label: 'Professional Skill' },
  { value: 'SCIENCE', label: 'Science Skill' },
  { value: 'TRANSPORT_FAMILIARITY', label: 'Transport Familiarity' },
  { value: 'WEAPON_FAMILIARITY', label: 'Weapon Familiarity' },
  { value: 'SKILL_LEVELS', label: 'Skill Levels' },
  { value: 'GENERAL', label: 'General Skill' },
];

const COMMON_SKILLS = [
  { name: 'Acrobatics', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Acting', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Animal Handler', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Breakfall', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Bribery', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Bugging', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Bureaucratics', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Charm', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Climbing', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Combat Driving', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Combat Piloting', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Computer Programming', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Concealment', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Contortionist', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Conversation', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Criminology', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Cryptography', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Deduction', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Demolitions', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Disguise', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Electronics', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Fast Draw', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Forensic Medicine', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Forgery', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Gambling', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'High Society', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Interrogation', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Inventor', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Lipreading', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Lockpicking', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Mechanics', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Mimicry', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Navigation', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Oratory', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Paramedics', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Persuasion', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Riding', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Security Systems', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Shadowing', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Sleight of Hand', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Stealth', characteristic: 'DEX' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Streetwise', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Survival', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Systems Operation', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Tactics', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Tracking', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Trading', characteristic: 'PRE' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Ventriloquism', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
  { name: 'Weaponsmith', characteristic: 'INT' as CharacteristicType, cost3: 3, costPer: 2 },
];

const CHARACTERISTICS: CharacteristicType[] = ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE'];

// Skill enhancer icons and descriptions
const SKILL_ENHANCER_INFO: Record<string, { icon: string; description: string }> = {
  'JACK_OF_ALL_TRADES': { icon: '🎭', description: 'PS skills cost 2 pts for full roll' },
  'SCHOLAR': { icon: '📚', description: 'KS skills cost 2 pts for full roll' },
  'SCIENTIST': { icon: '🔬', description: 'SS skills cost 2 pts for full roll' },
  'LINGUIST': { icon: '🗣️', description: 'Languages at reduced cost' },
  'TRAVELER': { icon: '🗺️', description: 'AK/CK skills cost 2 pts for full roll' },
  'WELL_CONNECTED': { icon: '🤝', description: 'Contacts at reduced cost' },
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function calculateSkillRoll(charValue: number, plusLevels: number): number {
  const baseRoll = 9 + Math.floor(charValue / 5);
  return baseRoll + plusLevels;
}

/** Represents a skill entry that might be a group/enhancer with children */
interface SkillDisplayItem {
  skill: Skill;
  children: Skill[];
  depth: number;
}

export function SkillsTab({ character, onUpdate }: SkillsTabProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEnhancerModalOpen, setIsEnhancerModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [selectedCommonSkill, setSelectedCommonSkill] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    type: 'CHARACTERISTIC_BASED' as SkillType,
    name: '',
    alias: '',
    notes: '',
    characteristic: 'INT' as CharacteristicType,
    baseCost: 3,
    levels: 0,
    proficiency: false,
    familiarity: false,
    everyman: false,
  });
  const [enhancerFormData, setEnhancerFormData] = useState<SkillEnhancerType>('JACK_OF_ALL_TRADES');
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    discountAdder: 0, // Points discount for children (e.g., -1)
    isEveryman: false, // Whether this is the Everyman skills group
  });
  const [editingGroup, setEditingGroup] = useState<Skill | null>(null);
  const [moveMenuOpenFor, setMoveMenuOpenFor] = useState<string | null>(null);

  const skills = character.skills ?? [];

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
  
  // Calculate total cost (only count non-group, non-enhancer skills, plus enhancer base costs)
  const totalCost = skills.reduce((sum, s) => {
    if (s.isGroup) return sum; // Groups don't cost points
    return sum + (s.realCost ?? s.baseCost ?? 0);
  }, 0);

  // Organize skills into a hierarchical display structure
  const displayItems = useMemo(() => {
    const items: SkillDisplayItem[] = [];
    const parentMap = new Map<string, Skill>();
    const childrenMap = new Map<string, Skill[]>();
    
    // First pass: identify parents and group children
    for (const skill of skills) {
      if (skill.isGroup || skill.isEnhancer) {
        parentMap.set(skill.id, skill);
        childrenMap.set(skill.id, []);
      }
    }
    
    // Second pass: assign children to parents
    for (const skill of skills) {
      if (!skill.isGroup && !skill.isEnhancer && skill.parentId) {
        const children = childrenMap.get(skill.parentId);
        if (children) {
          children.push(skill);
        }
      }
    }
    
    // Build display items in position order
    for (const skill of skills) {
      if (skill.isGroup || skill.isEnhancer) {
        // This is a parent - add it with its children
        items.push({
          skill,
          children: childrenMap.get(skill.id) || [],
          depth: 0,
        });
      } else if (!skill.parentId) {
        // Top-level skill (no parent)
        items.push({
          skill,
          children: [],
          depth: 0,
        });
      }
      // Skills with parentId are handled as children of their parent
    }
    
    return items;
  }, [skills]);

  const getCharValue = (type: CharacteristicType | 'GENERAL'): number => {
    if (type === 'GENERAL') return 11; // Default for non-characteristic skills
    const char = character.characteristics.find((c) => c.type === type);
    return char?.totalValue ?? 10;
  };

  // Get skill levels that apply to a skill (from same group)
  const getApplicableSkillLevels = (skill: Skill): number => {
    if (!skill.parentId) return 0;
    
    // Find all SKILL_LEVELS in the same group
    const skillLevelsInGroup = skills.filter(s => 
      s.parentId === skill.parentId && 
      s.xmlid === 'SKILL_LEVELS' &&
      s.id !== skill.id
    );
    
    // Sum up all the levels from skill level entries
    return skillLevelsInGroup.reduce((sum, sl) => sum + (sl.levels ?? 0), 0);
  };

  // Calculate skill roll for display
  const getSkillRoll = (skill: Skill): number | null => {
    // Groups and enhancers don't have rolls
    if (skill.isGroup || skill.isEnhancer) return null;
    
    // Skill Levels entries don't have their own roll display
    if (skill.xmlid === 'SKILL_LEVELS') return null;
    
    // If roll is already calculated, use it
    if (skill.roll) return skill.roll;
    
    // Familiarity is always 8-
    if (skill.familiarity) return 8;
    
    // Proficiency gives 11- roll
    if (skill.proficiency) return 11;
    
    // If no characteristic or it's GENERAL, can't calculate
    if (!skill.characteristic || skill.characteristic === 'GENERAL') return null;
    
    // Calculate from characteristic: 9 + (CHAR/5) + levels
    const charValue = getCharValue(skill.characteristic);
    const baseRoll = calculateSkillRoll(charValue, skill.levels);
    
    // Add any applicable skill levels from the same group
    const bonusLevels = getApplicableSkillLevels(skill);
    
    return baseRoll + bonusLevels;
  };

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

  // Format adders for display (e.g., WF with Common Melee, Common Missile)
  const formatAdders = (adders?: Adder[]): string => {
    if (!adders || adders.length === 0) return '';
    return adders
      .filter(a => a.alias && a.baseCost > 0)
      .map(a => a.alias)
      .join(', ');
  };

  // Check if a skill can be moved to a specific enhancer
  const canMoveToEnhancer = (skill: Skill, enhancer: Skill): boolean => {
    if (!enhancer.enhancerType) return false;
    
    // Check alias first (AK, KS, PS, SS, etc.) - this is more specific
    const alias = skill.alias;
    if (alias && SKILL_TO_ENHANCER_MAP[alias]) {
      return SKILL_TO_ENHANCER_MAP[alias] === enhancer.enhancerType;
    }
    
    // Fall back to xmlid or type
    const skillXmlId = skill.xmlid || skill.type;
    const matchingEnhancer = SKILL_TO_ENHANCER_MAP[skillXmlId];
    return matchingEnhancer === enhancer.enhancerType;
  };

  // Check if a skill can be moved to a specific group
  const canMoveToGroup = (skill: Skill, group: Skill): boolean => {
    // Everyman groups only accept Everyman skills
    const groupIsEveryman = group.name?.toLowerCase() === 'everyman' || group.isEverymanGroup === true;
    if (groupIsEveryman) {
      return skill.everyman === true;
    }
    // Other groups accept any skill
    return true;
  };

  // Get available parents for a specific skill (groups = filtered, enhancers = only matching)
  const getAvailableParents = (skill: Skill): Skill[] => {
    return skills.filter(s => {
      if (s.isGroup) return canMoveToGroup(skill, s); // Groups filtered by everyman rules
      if (s.isEnhancer) return canMoveToEnhancer(skill, s); // Enhancers only accept matching skills
      return false;
    });
  };

  // Move a skill to a group/enhancer (or remove from group)
  const handleMoveToGroup = (skillId: string, parentId: string | null) => {
    const updatedSkills = skills.map(s => {
      if (s.id === skillId) {
        // Find parent to apply any discount
        let discount = 0;
        if (parentId) {
          const parent = skills.find(p => p.id === parentId);
          if (parent?.isEnhancer) {
            discount = -1; // Skill enhancers give -1 cost discount
          } else if (parent?.adders && parent.adders.length > 0) {
            // Groups with adders can have discounts
            discount = parent.adders.reduce((sum, a) => sum + a.baseCost, 0);
          }
        }
        
        const baseRealCost = s.baseCost + (s.levels ?? 0) * 2;
        const newRealCost = Math.max(0, baseRealCost + discount);
        
        return {
          ...s,
          parentId: parentId ?? undefined,
          realCost: newRealCost,
        };
      }
      return s;
    });
    
    onUpdate({ ...character, skills: updatedSkills });
  };

  // Add a skill enhancer
  const handleAddEnhancer = () => {
    const enhancerNames: Record<SkillEnhancerType, string> = {
      'JACK_OF_ALL_TRADES': 'Jack of All Trades',
      'SCHOLAR': 'Scholar',
      'SCIENTIST': 'Scientist',
      'LINGUIST': 'Linguist',
      'TRAVELER': 'Traveler',
      'WELL_CONNECTED': 'Well Connected',
    };
    
    const newEnhancer: Skill = {
      id: generateId(),
      name: enhancerNames[enhancerFormData],
      type: 'GENERAL',
      baseCost: 3,
      realCost: 3,
      levels: 0,
      position: skills.length,
      isEnhancer: true,
      enhancerType: enhancerFormData,
    };
    
    onUpdate({ ...character, skills: [...skills, newEnhancer] });
    setIsEnhancerModalOpen(false);
  };

  // Delete a group/enhancer (moves children to top level)
  const handleDeleteGroupOrEnhancer = (groupId: string) => {
    const updatedSkills = skills
      .filter(s => s.id !== groupId)
      .map(s => {
        // Remove parentId reference and recalculate cost without discount
        if (s.parentId === groupId) {
          return {
            ...s,
            parentId: undefined,
            realCost: s.baseCost + (s.levels ?? 0) * 2,
          };
        }
        return s;
      });
    
    onUpdate({ ...character, skills: updatedSkills });
  };

  // Check if a group is the Everyman group (by name or explicit flag)
  const isEverymanGroup = (group: Skill): boolean => {
    return group.name?.toLowerCase() === 'everyman' || group.isEverymanGroup === true;
  };

  // Open edit modal for a group
  const openEditGroupModal = (group: Skill) => {
    setEditingGroup(group);
    // Find any discount adder (negative baseCost)
    const discountAdder = group.adders?.find(a => a.baseCost < 0);
    const existingDiscount = discountAdder?.baseCost ?? 0;
    setGroupFormData({
      name: group.name,
      discountAdder: existingDiscount,
      isEveryman: isEverymanGroup(group),
    });
    setIsGroupModalOpen(true);
  };

  // Save group (create or update)
  const handleSaveGroup = () => {
    const adders: Adder[] = [];
    if (groupFormData.discountAdder !== 0) {
      // Try to preserve existing adder id if possible
      const existingDiscountAdder = editingGroup?.adders?.find(a => a.baseCost < 0);
      adders.push({
        id: existingDiscountAdder?.id ?? generateId(),
        name: 'Group Discount',
        alias: `${groupFormData.discountAdder} pt`,
        baseCost: groupFormData.discountAdder,
        levels: 0,
      });
    }
    
    if (editingGroup) {
      // Update existing group and recalculate child costs
      const oldDiscountAdder = editingGroup.adders?.find(a => a.baseCost < 0);
      const oldDiscount = oldDiscountAdder?.baseCost ?? 0;
      const newDiscount = groupFormData.discountAdder;
      
      const updatedSkills = skills.map(s => {
        if (s.id === editingGroup.id) {
          return {
            ...s,
            name: groupFormData.name || 'Skill Group',
            adders: adders.length > 0 ? adders : undefined,
            isEverymanGroup: groupFormData.isEveryman || undefined,
          };
        }
        // Recalculate child costs if discount changed
        if (s.parentId === editingGroup.id && oldDiscount !== newDiscount) {
          const baseRealCost = s.baseCost + (s.levels ?? 0) * 2;
          return {
            ...s,
            realCost: Math.max(0, baseRealCost + newDiscount),
          };
        }
        return s;
      });
      
      onUpdate({ ...character, skills: updatedSkills });
    } else {
      // Create new group
      const newGroup: Skill = {
        id: generateId(),
        name: groupFormData.name || 'Skill Group',
        type: 'GENERAL',
        baseCost: 0,
        realCost: 0,
        levels: 0,
        position: skills.length,
        isGroup: true,
        adders: adders.length > 0 ? adders : undefined,
        isEverymanGroup: groupFormData.isEveryman || undefined,
      };
      
      onUpdate({ ...character, skills: [...skills, newGroup] });
    }
    
    setIsGroupModalOpen(false);
    setEditingGroup(null);
    setGroupFormData({ name: '', discountAdder: 0, isEveryman: false });
  };

  const openAddModal = () => {
    setEditingSkill(null);
    setSelectedCommonSkill('');
    setFormData({
      type: 'CHARACTERISTIC_BASED',
      name: '',
      alias: '',
      notes: '',
      characteristic: 'INT',
      baseCost: 3,
      levels: 0,
      proficiency: false,
      familiarity: false,
      everyman: false,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    setSelectedCommonSkill('');
    setFormData({
      type: skill.type,
      name: skill.name,
      alias: skill.alias ?? '',
      notes: skill.notes ?? '',
      characteristic: (skill.characteristic as CharacteristicType) ?? 'INT',
      baseCost: skill.baseCost,
      levels: skill.levels,
      proficiency: skill.proficiency ?? false,
      familiarity: skill.familiarity ?? false,
      everyman: skill.everyman ?? false,
    });
    setIsModalOpen(true);
  };

  const handleCommonSkillSelect = (skillName: string) => {
    setSelectedCommonSkill(skillName);
    const skill = COMMON_SKILLS.find((s) => s.name === skillName);
    if (skill) {
      setFormData({
        ...formData,
        name: skill.name,
        characteristic: skill.characteristic,
        type: 'CHARACTERISTIC_BASED',
        baseCost: 3,
      });
    }
  };

  const calculateCost = (): number => {
    if (formData.everyman) return 0;
    if (formData.familiarity) return 1;
    if (formData.proficiency) return 2;
    return formData.baseCost + (formData.levels * 2);
  };

  const calculateRoll = (): number | null => {
    if (formData.familiarity) return 8;
    if (formData.proficiency) return null;
    const charValue = getCharValue(formData.characteristic);
    return calculateSkillRoll(charValue, formData.levels);
  };

  const handleSave = () => {
    const cost = calculateCost();
    const roll = calculateRoll();
    
    const newSkill: Skill = {
      id: editingSkill?.id ?? generateId(),
      name: formData.name || 'Skill',
      alias: formData.alias || undefined,
      type: formData.type,
      notes: formData.notes || undefined,
      baseCost: cost,
      realCost: cost,
      levels: formData.levels,
      position: editingSkill?.position ?? skills.length,
      characteristic: formData.characteristic,
      roll: roll ?? undefined,
      proficiency: formData.proficiency,
      familiarity: formData.familiarity,
      everyman: formData.everyman || undefined,
    };

    let updatedSkills: Skill[];
    if (editingSkill) {
      updatedSkills = skills.map((s) => (s.id === editingSkill.id ? newSkill : s));
    } else {
      updatedSkills = [...skills, newSkill];
    }

    onUpdate({ ...character, skills: updatedSkills });
    setIsModalOpen(false);
  };

  const handleDelete = (skillId: string) => {
    onUpdate({
      ...character,
      skills: skills.filter((s) => s.id !== skillId),
    });
  };

  // Render a single skill row
  const renderSkillRow = (skill: Skill, isChild: boolean = false) => {
    const roll = getSkillRoll(skill);
    const cost = skill.realCost ?? skill.baseCost ?? 0;
    const adderText = formatAdders(skill.adders);
    const availableParents = getAvailableParents(skill);
    
    return (
      <tr key={skill.id} className={isChild ? 'child-row' : ''}>
        <td style={{ paddingLeft: isChild ? '2rem' : undefined }}>
          <div style={{ fontWeight: 500 }}>
            {isChild && <span style={{ color: 'var(--text-secondary)', marginRight: '0.25rem' }}>›</span>}
            {skill.name}
            {adderText && (
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                : {adderText}
              </span>
            )}
            {skill.nativeTongue && (
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                (Native)
              </span>
            )}
          </div>
          {skill.notes && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: isChild ? '0.75rem' : undefined }}>
              {skill.notes}
            </div>
          )}
        </td>
        <td style={{ textAlign: 'center' }}>
          {roll !== null ? `${roll}-` : skill.proficiency ? 'Prof' : '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          {cost > 0 ? cost : '—'}
        </td>
        <td>
          <div className="item-actions" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            {/* Move to group/enhancer - icon button with popup */}
            {availableParents.length > 0 && (
              <div data-move-menu style={{ position: 'relative' }}>
                <button
                  className="btn-icon-small"
                  onClick={() => setMoveMenuOpenFor(moveMenuOpenFor === skill.id ? null : skill.id)}
                  title="Move to group/enhancer"
                  style={{ 
                    opacity: 1,
                    background: moveMenuOpenFor === skill.id ? 'var(--surface)' : undefined,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                >
                  <span>📂</span><span style={{ fontSize: '0.65em' }}>▾</span>
                </button>
                {moveMenuOpenFor === skill.id && (
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
                    overflowX: 'hidden',
                  }}>
                    {/* Only show "None" if skill currently has a parent */}
                    {skill.parentId && (
                      <div
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                        }}
                        onClick={() => { handleMoveToGroup(skill.id, null); setMoveMenuOpenFor(null); }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                      >
                        — None —
                      </div>
                    )}
                    {/* Filter out current parent from the list */}
                    {availableParents.filter(p => p.id !== skill.parentId).map(parent => {
                      const enhInfo = parent.enhancerType ? SKILL_ENHANCER_INFO[parent.enhancerType] : null;
                      return (
                        <div
                          key={parent.id}
                          style={{
                            padding: '0.5rem 0.75rem',
                            cursor: 'pointer',
                          }}
                          onClick={() => { handleMoveToGroup(skill.id, parent.id); setMoveMenuOpenFor(null); }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
                          {enhInfo && <span style={{ marginRight: '0.5rem' }}>{enhInfo.icon}</span>}
                          {parent.name}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <button
              className="btn-icon-small"
              onClick={() => openEditModal(skill)}
              title="Edit"
            >
              ✏️
            </button>
            <button
              className="btn-icon-small"
              onClick={() => handleDelete(skill.id)}
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render a group or enhancer header row
  const renderGroupRow = (item: SkillDisplayItem) => {
    const { skill, children } = item;
    const isCollapsed = collapsedGroups.has(skill.id);
    const enhancerInfo = skill.enhancerType ? SKILL_ENHANCER_INFO[skill.enhancerType] : null;
    const groupCost = skill.realCost ?? skill.baseCost ?? 0;
    const childrenCost = children.reduce((sum, c) => sum + (c.realCost ?? c.baseCost ?? 0), 0);
    const totalGroupCost = groupCost + childrenCost;
    
    return (
      <>
        <tr 
          key={skill.id} 
          className="group-header-row"
          onClick={() => children.length > 0 && toggleGroup(skill.id)}
          style={{ cursor: children.length > 0 ? 'pointer' : undefined }}
        >
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              {children.length > 0 && (
                <span style={{ 
                  display: 'inline-block', 
                  width: '1rem', 
                  transition: 'transform 0.2s',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                }}>
                  ▼
                </span>
              )}
              {enhancerInfo && <span title={enhancerInfo.description}>{enhancerInfo.icon}</span>}
              <span style={{ color: skill.isEnhancer ? 'var(--primary)' : 'var(--text-primary)' }}>
                {skill.name}
              </span>
              {children.length > 0 && (
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 400, 
                  color: 'var(--text-secondary)',
                  marginLeft: '0.25rem'
                }}>
                  ({children.length} skill{children.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            {skill.notes && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.5rem' }}>
                {skill.notes}
              </div>
            )}
          </td>
          <td style={{ textAlign: 'center' }}>—</td>
          <td style={{ textAlign: 'right', fontWeight: 500 }}>
            {/* Enhancers show their own cost (3 pts), groups show total of children */}
            {skill.isEnhancer 
              ? (groupCost > 0 ? groupCost : '—')
              : (totalGroupCost > 0 ? totalGroupCost : '—')}
          </td>
          <td onClick={(e) => e.stopPropagation()}>
            <div className="item-actions">
              {/* Groups can be edited, enhancers cannot */}
              {skill.isGroup && (
                <button
                  className="btn-icon-small"
                  onClick={() => openEditGroupModal(skill)}
                  title="Edit group"
                >
                  ✏️
                </button>
              )}
              <button
                className="btn-icon-small"
                onClick={() => handleDeleteGroupOrEnhancer(skill.id)}
                title={`Delete ${skill.isEnhancer ? 'enhancer' : 'group'} (children become top-level)`}
              >
                🗑️
              </button>
            </div>
          </td>
        </tr>
        {!isCollapsed && children.map(child => renderSkillRow(child, true))}
      </>
    );
  };

  if (skills.length === 0 && !isModalOpen) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📚</div>
        <div className="empty-state-title">No Skills</div>
        <p>This character has no skills yet.</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openAddModal}>
          Add Skill
        </button>
      </div>
    );
  }

  return (
    <div className="skills-tab">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Skills ({totalCost} pts)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setIsEnhancerModalOpen(true)}
              title="Add a Skill Enhancer (Jack of All Trades, Scholar, etc.)"
            >
              Add Enhancer
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setGroupFormData({ name: '', discountAdder: 0, isEveryman: false });
                setIsGroupModalOpen(true);
              }}
              title="Add a skill group for organization"
            >
              Add Group
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>Add Skill</button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'center' }}>Roll</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item) => {
              if (item.skill.isGroup || item.skill.isEnhancer) {
                return renderGroupRow(item);
              } else {
                return renderSkillRow(item.skill);
              }
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSkill ? 'Edit Skill' : 'Add Skill'}
        size="medium"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: 'auto' }}>
              Cost: {calculateCost()} pts
              {calculateRoll() !== null && ` • Roll: ${calculateRoll()}-`}
            </span>
            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingSkill ? 'Save Changes' : 'Add Skill'}
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Quick Select Common Skill</label>
          <select
            className="form-select"
            value={selectedCommonSkill}
            onChange={(e) => handleCommonSkillSelect(e.target.value)}
          >
            <option value="">-- Select or enter custom below --</option>
            {COMMON_SKILLS.map((skill) => (
              <option key={skill.name} value={skill.name}>
                {skill.name} ({skill.characteristic})
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Skill Name</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Stealth, Computer Programming"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as SkillType })}
            >
              {SKILL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
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
            <label className="form-label">Based On</label>
            <select
              className="form-select"
              value={formData.characteristic}
              onChange={(e) => setFormData({ ...formData, characteristic: e.target.value as CharacteristicType })}
              disabled={formData.familiarity}
            >
              {CHARACTERISTICS.map((char) => (
                <option key={char} value={char}>
                  {char} ({getCharValue(char)})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">+ Levels</label>
            <input
              type="number"
              className="form-input"
              value={formData.levels}
              onChange={(e) => setFormData({ ...formData, levels: parseInt(e.target.value) || 0 })}
              min={0}
              disabled={formData.familiarity || formData.proficiency}
            />
          </div>
        </div>

        <div className="form-group" style={{ display: 'flex', gap: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.familiarity}
              onChange={(e) => setFormData({ 
                ...formData, 
                familiarity: e.target.checked,
                proficiency: false,
                levels: 0
              })}
            />
            <span>Familiarity (8-, 1 pt)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.proficiency}
              onChange={(e) => setFormData({ 
                ...formData, 
                proficiency: e.target.checked,
                familiarity: false,
                levels: 0
              })}
            />
            <span>Proficiency (2 pts)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.everyman}
              onChange={(e) => setFormData({ ...formData, everyman: e.target.checked })}
            />
            <span>Everyman (0 pts)</span>
          </label>
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Specialization, details..."
            rows={2}
          />
        </div>
      </Modal>

      {/* Skill Enhancer Modal */}
      <Modal
        isOpen={isEnhancerModalOpen}
        onClose={() => setIsEnhancerModalOpen(false)}
        title="Add Skill Enhancer"
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIsEnhancerModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAddEnhancer}>
              Add Enhancer (3 pts)
            </button>
          </div>
        }
      >
        <div className="form-group">
          <label className="form-label">Select Skill Enhancer</label>
          <select
            className="form-select"
            value={enhancerFormData}
            onChange={(e) => setEnhancerFormData(e.target.value as SkillEnhancerType)}
          >
            <option value="JACK_OF_ALL_TRADES">🎭 Jack of All Trades (Professional Skills)</option>
            <option value="SCHOLAR">📚 Scholar (Knowledge Skills)</option>
            <option value="SCIENTIST">🔬 Scientist (Science Skills)</option>
            <option value="LINGUIST">🗣️ Linguist (Languages)</option>
            <option value="TRAVELER">🗺️ Traveler (Area/City Knowledge)</option>
            <option value="WELL_CONNECTED">🤝 Well Connected (Contacts)</option>
          </select>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Skill Enhancers cost 3 points and reduce the cost of associated skills by 1 point each.
          Move skills into the enhancer using the dropdown in their row.
        </p>
      </Modal>

      {/* Skill Group Modal */}
      <Modal
        isOpen={isGroupModalOpen}
        onClose={() => { setIsGroupModalOpen(false); setEditingGroup(null); }}
        title={editingGroup ? 'Edit Skill Group' : 'Add Skill Group'}
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setIsGroupModalOpen(false); setEditingGroup(null); }}>
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
            placeholder="e.g., Combat Skills, Background Skills"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Discount Adder (optional)</label>
          <select
            className="form-select"
            value={groupFormData.discountAdder}
            onChange={(e) => setGroupFormData({ ...groupFormData, discountAdder: parseInt(e.target.value) })}
          >
            <option value="0">No discount</option>
            <option value="-1">-1 point per skill</option>
            <option value="-2">-2 points per skill</option>
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Groups are purely organizational. Discounts should only be used for campaign-specific rules.
          </p>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={groupFormData.isEveryman}
              onChange={(e) => setGroupFormData({ ...groupFormData, isEveryman: e.target.checked })}
            />
            <span>Everyman Group</span>
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Everyman groups can only contain everyman skills.
          </p>
        </div>
      </Modal>

      <style>{`
        .group-header-row {
          background: var(--surface-secondary);
        }
        .group-header-row:hover {
          background: var(--surface-hover);
        }
        .child-row {
          background: var(--surface-primary);
        }
        .child-row:hover {
          background: var(--surface-hover);
        }
      `}</style>
    </div>
  );
}
