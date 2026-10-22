/**
 * Which modifiers a power can take: Hero Designer's "Modifier Intelligence" (Modifier.included
 * and its overrides in com.hero.objects.modifiers), with its messages. These are warnings, as in
 * Hero Designer, which lets a builder force any modifier on.
 */

import { POWER_TEMPLATE, effectiveDuration, getModifierByXmlId, powerEndCost, type PowerModifier } from './modifierDefinitions.js';

/** What the rules need to know about the power */
export interface PowerFacts {
  xmlId?: string;
  /** Its modifiers (the one being checked may be among them; it's left out) */
  modifiers: (PowerModifier & { value: number })[];
  /** XMLIDs of its adders */
  adders?: string[];
  /** Base cost (after adders), for its END */
  baseCost?: number;
  /** Set for a list or framework: modifiers there apply to what's in it */
  container?: 'LIST' | 'MULTIPOWER' | 'VPP' | 'COMPOUNDPOWER';
  /** XMLIDs of the character's other powers (Affects Physical World needs Desolidification) */
  characterPowers?: string[];
  /** The character's other powers and equipment (for Linked's target, Unified Power's partners) */
  characterItems?: { id: string; xmlId?: string; modifiers: PowerModifier[] }[];
}

const TEMPLATE = POWER_TEMPLATE;

const ON_OTHERS = (target: string) => target !== 'SELFONLY' && target !== 'N/A';

/**
 * Why a power can't take this modifier, in Hero Designer's words, or '' if it can (or if nothing's
 * known about the power, like a Custom Power)
 */
export function modifierProblem(modifierXmlId: string, power: PowerFacts): string {
  const def = getModifierByXmlId(modifierXmlId);
  if (!def) return '';
  const name = def.display;
  const others = power.modifiers.filter((m) => m.xmlId !== modifierXmlId);
  const has = (id: string) => others.some((m) => m.xmlId === id);
  const option = (id: string) => others.find((m) => m.xmlId === id)?.optionId;
  const template = TEMPLATE.get(power.xmlId ?? '');

  // Excludes: other modifiers, the power itself, its adders
  for (const id of def.excludes ?? []) {
    const other = others.find((m) => m.xmlId === id);
    if (other) return `${name} cannot be applied to abilities which have ${getModifierByXmlId(id)?.display ?? id}.`;
    if (power.xmlId === id) return `${name} cannot be applied to ${template?.display ?? id}.`;
    if (power.adders?.includes(id)) return `${name} cannot be applied to abilities which have that adder.`;
  }

  // Frameworks and lists
  const types = def.types ?? [];
  if (types.includes('VPP') && power.container !== 'VPP') return `${name} can only be applied to a Variable Power Pool.`;
  if (types.includes('MP') && power.container !== 'MULTIPOWER') return `${name} can only be applied to a Multipower.`;
  if (types.includes('LIST') && power.container !== 'LIST') return `${name} can only be applied to a List.`;
  // A naked advantage can be any advantage, for whatever power it's for (NakedModifier)
  if (power.container || !template || template.xmlId === 'NAKEDMODIFIER') return '';

  const target = power.modifiers.some((m) => m.xmlId === 'AOE') ? 'HEX' : (template.target ?? 'N/A');
  const powerTypes = template.types ?? [];
  const attack = powerTypes.includes('ATTACK');
  // Absent, a defense is unknown for an attack (Entangle) but none for anything else
  const defense = template.defense ?? (attack ? undefined : 'NONE');
  const duration = effectiveDuration({ xmlId: power.xmlId, modifiers: others });
  const baseDuration = template.duration ?? 'INSTANT';
  const range = has('NORANGE') ? 0 : has('LOS') ? -1 : has('RANGED') ? 1 : template.range === 'Yes' ? 1 : template.range === 'LOS' ? -1 : 0;
  const end = () => powerEndCost(Math.max(1, power.baseCost ?? 1), template.usesEnd !== false, others);
  const xml = power.xmlId ?? '';

  // Template TYPE: the power must be one of them (Hardened also suits an Entangle)
  const typed = types.filter((t) => !['VPP', 'MP', 'EC', 'LIST'].includes(t));
  if (typed.length && !typed.some((t) => powerTypes.includes(t)) && !(modifierXmlId === 'HARDENED' && xml === 'ENTANGLE')) {
    return `${name} can only be applied to abilities of type ${typed.map((t) => t.toLowerCase()).join(' or ')}.`;
  }

  const ranged = `${name} can only be applied to Ranged Powers.`;
  const targetedOnOthers = `${name} can only be applied to abilities which are targeted on others.`;

  switch (modifierXmlId) {
    case 'AVAD':
      if (attack || template.doesDamage || ON_OTHERS(target) || powerTypes.includes('MENTAL') || xml === 'DISPEL' || xml === 'TELEPATHY') return '';
      return `${name} can only be applied to Attack Powers and Powers which affect others.`;
    case 'AFFECTSDESOLID':
      return attack || powerTypes.includes('DEFENSE') || ON_OTHERS(target) ? '' : `${name} can only be applied to Defense Powers and Powers which affect others.`;
    case 'AFFECTSPHYSICALWORLD':
      if (!ON_OTHERS(target) && xml !== 'SUMMON' && xml !== 'DUPLICATION') return `${name} can only be applied to Powers which affect others.`;
      if (xml === 'DESOLIDIFICATION') return `${name} cannot be applied to Desolidification. It should be applied to the actual Powers/abilities that will affect the physical world while the character is Desolidified.`;
      return power.characterPowers && !power.characterPowers.includes('DESOLIDIFICATION') ? `${name} may only be purchased by characters who have Desolidification.` : '';
    case 'ACV':
      return ['OCV', 'ECV', 'OMCV', 'MCV', 'DCV', 'DMCV', 'HEX'].includes(target) ? '' : `${name} can only be applied to abilities that are targeted on others.`;
    case 'ARMORPIERCING':
    case 'SEMIARMORPIERCING':
      if (modifierXmlId === 'ARMORPIERCING' && has('NND')) return `${name} cannot be applied to abilities which have No Normal Defense.`;
      if (xml === 'TELEPORTATION') return '';
      if (!ON_OTHERS(target)) return `${name} can only be applied to abilities which affect/are targeted on others.`;
      return defense === 'NONE' ? `${name} can only be applied to abilities which act against a target's defenses.` : '';
    case 'AUTOFIRE':
      return xml === 'ABSORPTION' || ON_OTHERS(target) ? '' : `${name} can only be applied to abilities which require an Attack Roll.`;
    case 'BOECV':
      if (!ON_OTHERS(target)) return `${name} cannot be applied to self-only abilities.`;
      return target === 'ECV' ? `${name} cannot be applied to abilities which already target ECV.` : '';
    case 'BEAM':
      if (range === 0) return `${name} can only be applied to Ranged Attack Powers`;
      return target === 'HEX' ? `${name} cannot be applied to area-affecting Powers` : '';
    case 'CANBEMISSILEDEFLECTED':
      if (template.doesDamage && defense === 'NORMAL' && target === 'DCV') return `${template.display} can already be Missile Deflected.`;
      return ['DCV', 'HEX', 'ECV', 'OCV', 'OMCV', 'DMCV'].includes(target) ? '' : `${name} can only be applied to Attack Powers which are targeted on an opponent.`;
    case 'NOTELEPORT':
      return xml === 'ENTANGLE' || xml === 'FORCEWALL' || powerTypes.includes('DEFENSE') ? '' : `${name} can only be applied to Entangles or Powers which are used to create walls or barriers.`;
    case 'COSTSEND':
      if (xml === 'ENDURANCERESERVE' || xml === 'ENDURANCERESERVEREC') return `${name} cannot be applied to an Endurance Reserve or its Recovery.`;
      if (has('REDUCEDEND')) return `${name} cannot be applied to an ability with Reduced END.`;
      if (has('COSTSENDONLYTOACTIVATE')) return `${name} cannot be applied to an ability with Costs END Only To Activate.`;
      if (has('COSTSENDTOMAINTAIN')) return `${name} cannot be applied to an ability with Costs END To Maintain.`;
      return end() === 0 ? '' : `${name} cannot be applied to an ability which already costs END.`;
    case 'COSTSENDTOMAINTAIN':
      if (has('REDUCEDEND')) return `${name} cannot be applied to an ability with Reduced END.`;
      if (has('COSTSEND')) return `${name} cannot be applied to an ability with Costs END.`;
      if (has('COSTSENDONLYTOACTIVATE')) return `${name} cannot be applied to an ability with Costs END Only To Activate (use Costs END instead).`;
      if (end() === 0 && xml !== 'DISPEL') return `${name} cannot be applied to an ability which does not cost END.`;
      return duration === 'INSTANT' && !template.continuingEffect ? `${name} can only be applied to abilities which are Constant in duration.` : '';
    case 'COSTSENDONLYTOACTIVATE':
      if (duration === 'INSTANT') return `${name} can only be applied to abilities which are Constant in duration.`;
      if (powerTypes.includes('MENTAL')) return `${name} cannot be applied to Mental Powers.`;
      if (has('REDUCEDEND')) return `${name} cannot be applied to an ability with Reduced END.`;
      if (has('COSTSEND')) return `${name} cannot be applied to an ability with Costs END.`;
      if (has('COSTSENDTOMAINTAIN')) return `${name} cannot be applied to an ability with Costs END To Maintain (use Costs END instead).`;
      return end() === 0 ? `${name} cannot be applied to an ability which does not cost END.` : '';
    case 'CUMULATIVE':
      if (['ABSORPTION', 'AID', 'HEALING', 'SUCCOR'].includes(xml)) return `${template.display} cannot have Cumulative applied to it, since it already has its own rules for how many Character points can be added to a particular Characteristic or Power and how and at what rate they're added.`;
      if (xml === 'TRANSFORM') return `${template.display} is already cumulative in nature.`;
      if (template.doesDamage) return `${name} cannot be applied to abilities that cause STUN or BODY damage.`;
      if (defense === 'NONE') return `${name} can only be applied to abilities which act against a target's Defenses`;
      return ON_OTHERS(target) ? '' : `${name} can only be applied to abilities which require an Attack Roll.`;
    case 'DAMAGEOVERTIME':
      if ((attack && ON_OTHERS(target) && template.doesDamage) || powerTypes.includes('MENTAL') || (powerTypes.includes('ADJUSTMENT') && ON_OTHERS(target))) return '';
      return `${name} can only be applied to Attack Powers and Powers which affect others.`;
    case 'DAMAGESHIELD':
      return ['CONSTANT', 'PERSISTENT', 'INHERENT'].includes(duration) ? '' : `${name} can only be applied to Constant, Persistent, or Inherent abilities (or abilities with the Continuous Advantage).`;
    case 'DELAYEDRETURNRATE':
      return xml === 'HEALING' ? `${template.display} has no return/fade rate (its effects are permanent).` : '';
    case 'DIFFICULTTODISPEL':
      return duration === 'INHERENT' ? `${name} cannot be applied to an Inherent ability. Inherent abilities cannot be Dispelled.` : '';
    case 'DOESBODY':
      if (xml === 'FLASH') return `${name} cannot be applied to a Flash Attack.`;
      // An AVAD attack only does STUN (6E1 326), so it can buy BODY back
      if (template.doesBody && !has('AVAD')) return `${template.display} already does BODY Damage.`;
      return template.doesDamage ? '' : `${name} can only be applied to abilities which damage the target.`;
    case 'DOESKB':
      if (template.doesKnockback) return `${template.display} already does Knockback.`;
      return ['DCV', 'ECV', 'HEX'].includes(target) ? '' : targetedOnOthers;
    case 'DOUBLEKB':
    case 'NOKB':
      return template.doesKnockback ? '' : `${name} can only be applied to abilities which do Knockback.`;
    case 'DOUBLEENDCOST':
    case 'ENDRESERVEOREND':
      if (xml === 'ENDURANCERESERVE' || xml === 'ENDURANCERESERVEREC') return `${name} cannot be applied to an ${template.display}`;
      if (end() === 0) return `${name} can only be applied to abilities which cost END.`;
      return power.characterPowers && !power.characterPowers.includes('ENDURANCERESERVE') ? `${name} can only be applied to abilities on characters that have an Endurance Reserve.` : '';
    case 'EXTRATIME':
      return xml === 'REGENERATION' ? `${name} cannot be applied to Regeneration.` : '';
    case 'HALFRANGEMODIFIER':
    case 'INCREASEDMAXRANGE':
    case 'REDUCEDBYRANGE':
    case 'DROPPED':
      return range > 0 || (range < 0 && modifierXmlId === 'REDUCEDBYRANGE') ? '' : ranged;
    case 'NORANGEMODIFIER':
      return xml === 'TELEPORTATION' || range > 0 ? '' : ranged;
    case 'HOLEINTHEMIDDLE':
      return target === 'HEX' ? '' : `${name} can only be applied to abilities which affect an area.`;
    case 'INCREASEDEND':
      if (has('REDUCEDEND')) return `${name} cannot be assigned to an ability with Reduced Endurance.`;
      return end() === 0 ? `${name} cannot be applied to an ability which does not cost END.` : '';
    case 'INDIRECT':
      return target === 'SELFONLY' && xml !== 'STRETCHING' ? `${name} can only be applied to abilities which require an Attack Roll.` : '';
    case 'INVISIBLE':
      if (powerTypes.includes('MENTAL')) return '';
      return has('VISIBLE') ? `${name} cannot be applied to a Power/ability with the Visible Limitation on it.` : '';
    case 'LIMITEDARCOFFIRE':
      return ON_OTHERS(target) ? '' : `${name} may only be applied to abilities which are targeted on others.`;
    case 'OTHERSONLY':
      return ON_OTHERS(target) ? '' : `${name} can only be applied to Powers which are capable of affecting others.`;
    case 'SELFONLY':
      return xml === 'CONCEALMENT' || ON_OTHERS(target) ? '' : `${name} can only be applied to Powers which are capable of affecting others.`;
    case 'LIMITEDRANGE':
      if (has('RANGED')) return `${name} cannot be applied to Powers that have taken the Ranged Advantage. Use the options on the Ranged Advantage instead.`;
      if (range === 0) return ranged;
      return range < 0 ? `${name} cannot be applied to Line Of Sight Powers. You should first take the Normal Range Limitation.` : '';
    case 'LOS':
      if (has('UOO') && has('RANGED')) return '';
      if (range === 0) return ranged;
      return range < 0 ? `${name} is already Line Of Sight.` : '';
    case 'NORANGE':
      if (xml === 'DUPLICATION') return `${name} cannot be applied to Duplication.`;
      if (has('RANGED')) return `${name} cannot be applied to Powers that have taken the Ranged Advantage.`;
      return range === 0 ? ranged : '';
    case 'NORMALRANGE':
      return range === -1 ? '' : `${name} can only be applied to Line Of Sight Powers.`;
    case 'SUBJECTTORANGEMODIFIER':
      return range === -1 || has('NORMALRANGE') ? '' : `${name} can only be applied to Line Of Sight Powers.`;
    case 'RANGEBASEDONSTR':
      if (xml === 'DUPLICATION') return `${name} cannot be applied to Duplication.`;
      if (xml === 'HANDTOHANDATTACK') return `${name} cannot be applied to HTH Attack.`;
      if (has('RANGED')) return `${name} cannot be applied to Powers that have taken the Ranged Advantage. Use the options on the Ranged Advantage instead.`;
      return range === 0 ? ranged : '';
    case 'NOTTHROUGHMINDLINK':
      if (xml === 'MINDLINK') return `${name} cannot be applied to Mind Link.`;
      if (power.characterPowers && !power.characterPowers.includes('MINDLINK')) return `${name} can only be applied if the character has Mind Link.`;
      return has('BASEDONCON') ? `${name} cannot be applied to an ability with Based On CON.` : '';
    case 'ONLYTOSTARTING':
      return xml === 'HEALING' ? `${template.display} already restores only to starting values.` : '';
    case 'PERSONALIMMUNITY':
      return target === 'SELFONLY' ? `${name} cannot be applied to self-only Powers.` : '';
    case 'PHYSICALMANIFESTATION':
      return duration === 'CONSTANT' ? '' : `${name} may only be applied to Constant Powers.`;
    case 'REALWEAPON':
      return attack || xml === 'PENALTY_SKILL_LEVELS' ? '' : `${name} can only be applied to Attack Powers or CSLs/PSLs.`;
    case 'REQUIREDHANDS':
      return attack || powerTypes.includes('DEFENSE') || xml === 'PENALTY_SKILL_LEVELS' || xml === 'COMBAT_LEVELS' ? '' : `${name} can only be applied to Attack Powers, Defense Powers, or CSLs/PSLs.`;
    case 'TRANSDIMENSIONAL':
      return xml === 'STRETCHING' || ['DCV', 'ECV', 'HEX'].includes(target) ? '' : `${name} can only be applied to Powers which affect/are targeted on others.`;
    case 'TRANSPARENT':
      return xml === 'FORCEWALL' ? '' : 'Transparent may only be applied to Force Walls.';
    case 'TURNMODE':
      return xml === 'FLIGHT' || xml === 'GLIDING' ? `${template.display} already has a Turn Mode.` : '';
    case 'VARIABLETARGET':
      return duration !== 'INSTANT' && attack ? '' : `${name} can only be applied to Constant Attack abilities.`;
    case 'VISIBLE':
      if (powerTypes.includes('MENTAL') && !has('BASEDONCON') && !has('BOECV')) return '';
      if (has('INVISIBLE')) return `${name} cannot be applied to a Power/ability with the Invisible Advantage on it.`;
      return option('FOCUS')?.startsWith('O') ? `${name} cannot be taken with the Limitation Focus if the Focus is Obvious.` : '';
    case 'MEGASCALE':
      if (target === 'HEX' || range !== 0 || xml === 'MINDSCAN' || powerTypes.includes('SENSORY')) return '';
      if (powerTypes.includes('MOVEMENT') && xml !== 'FTL' && xml !== 'EXTRADIMENSIONALMOVEMENT') return '';
      return `${name} can only be applied to Powers which already affect an area, Movement Powers (except Extradimensional Movement and FTL Travel), and Powers which work at Range.`;
    case 'CONTINUOUS':
      if (xml === 'SUPPRESS' || xml === 'SUCCOR') return '';
      if (baseDuration === 'CONSTANT') return `${template.display} is already Constant in duration.`;
      if (baseDuration === 'INHERENT') return `${template.display} is an Inherent ability.`;
      return baseDuration === 'PERSISTENT' ? `${template.display} is already Persistent in duration.` : '';
    case 'UNCONTROLLED':
      return duration === 'INSTANT' ? `${name} cannot be applied to Instant abilities.` : '';
    case 'PENETRATING':
      if (powerTypes.includes('DEFENSE')) return `${name} cannot be applied to Defense Powers.`;
      if (!ON_OTHERS(target)) return `${name} can only be applied to abilities which require an Attack Roll.`;
      return has('NND') ? `${name} cannot be applied to No Normal Defense Attacks.` : '';
    case 'ALWAYSON':
      if (has('FOCUS')) return `${name} may not be applied to abilities with the Focus Limitation.`;
      if (has('STOPSWHENSTUNNED') || has('STOPSWHENKOD')) return `${name} may not be applied to abilities that stop working when the character is Stunned or Knocked Out.`;
      if (duration !== 'PERSISTENT' && duration !== 'INHERENT') return `${name} may only be applied to abilities which are either Persistent or Inherent`;
      return end() > 0 ? `${name} may not be applied to abilities which use END` : '';
    case 'PERSISTENT':
      if (xml === 'COMBAT_LEVELS') return `${name} cannot be applied to Combat Skill Levels of any form.`;
      if (has('UOO')) return '';
      if (end() > 0 && has('COSTSENDONLYTOACTIVATE')) return `${name} cannot be applied to Powers which cost END only to Activate.`;
      if (duration === 'INSTANT' && !template.continuingEffect) return `${name} cannot be applied to Instant Powers -- apply Constant first.`;
      if (baseDuration === 'PERSISTENT') return `${template.display} is already Persistent.`;
      return baseDuration === 'INHERENT' ? `${template.display} is already Inherent.` : '';
    case 'INHERENT':
      if (end() > 0) return `${name} cannot be applied to abilities which cost END.`;
      return duration === 'PERSISTENT' ? '' : `${name} can only be applied to abilities which are Persistent.`;
    case 'INSTANT':
      if (has('CONTINUOUS') || has('PERSISTENT') || has('INHERENT')) return `${name} cannot be assigned to an ability which have Continuous, Persistent, or Inherent assigned.`;
      if (duration === 'INSTANT') return `${template.display} is already Instant.`;
      if (duration === 'PERSISTENT') return `${name} cannot be applied to a Persistent ability. The ability must be made non-Persistent first.`;
      return duration === 'CONSTANT' ? '' : `${name} can only be applied to Powers which are Constant.`;
    case 'NONPERSISTENT':
      if ((baseDuration === 'PERSISTENT' || baseDuration === 'INHERENT') && end() === 0) return '';
      return has('COSTSENDTOMAINTAIN') ? '' : `${name} can only be applied to abilities which are Persistent.`;
    case 'STICKY':
      if (!['DCV', 'ECV', 'HEX'].includes(target)) return `${name} can only be applied to Powers which affect/are targeted on others.`;
      return powerTypes.includes('MENTAL') && !has('BASEDONCON') ? `${name} cannot be applied to Mental Powers unless Based On CON is purchased.` : '';
    case 'RANGED':
      if (xml === 'DUPLICATION' || xml === 'HANDTOHANDATTACK' || xml === 'REFLECTION') return `${name} cannot be applied to ${template.display}.`;
      if (xml === 'MISSILEDEFLECTION' || has('UOO')) return '';
      if (target === 'SELFONLY') return `${name} cannot be applied to Self-Only Powers.`;
      return range !== 0 ? `${template.display} is already Ranged.` : '';
    case 'TIMELIMIT':
      if (!['PERSISTENT', 'CONSTANT', 'INSTANT'].includes(duration)) return `${name} can only be applied to Persistent, Constant, or Instant Powers`;
      if (duration !== 'INSTANT' && end() > 0 && !has('COSTSENDONLYTOACTIVATE') && option('COSTSEND') !== 'ACTIVATE') {
        return `${name} can only be applied to abilities which cost 0 END or which cost END only to activate`;
      }
      return '';
    case 'PARTIALCOVERAGE':
      return xml === 'BODY' || xml === 'CLAIRSENTIENCE' || powerTypes.includes('DEFENSE') ? '' : `${name} may only be applied to BODY, Clairsentience, and Defense Powers.`;
    case 'REDUCEDEND': {
      if (has('INCREASEDEND')) return `${name} cannot be applied to an ability with the Increased END Limitation.`;
      if (has('COSTSEND')) return `${name} cannot be applied to an ability with the Costs END Limitation.`;
      if (has('COSTSENDONLYTOACTIVATE')) return `${name} cannot be applied to an ability with Costs END Only To Activate.`;
      if (has('COSTSENDTOMAINTAIN')) return `${name} cannot be applied to an ability with Costs END To Maintain.`;
      // Charges don't count: Reduced Endurance is for the END the power would otherwise cost
      const withoutCharges = powerEndCost(Math.max(1, power.baseCost ?? 1), template.usesEnd !== false, others.filter((m) => m.xmlId !== 'CHARGES'));
      return withoutCharges === 0 ? `${template.display} does not cost END.` : '';
    }
    default:
      return '';
  }
}

// ============================================================================
// Rules only the book states
// ============================================================================

/** A rule from 6E1 that Hero Designer doesn't enforce, with the page it's on */
export interface BookNote {
  page: number;
  text: string;
}

/** A modifier as the book's rules look at it */
type NotedModifier = PowerModifier & {
  value: number;
  adders?: { xmlId?: string; optionId?: string; baseCost: number }[];
  modifiers?: { xmlId?: string }[];
  linkedId?: string;
  levels?: number;
};

const CHARACTERISTICS = ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN'];

/**
 * Rules for this modifier that 6E1 states but Hero Designer (and so hero6e) doesn't apply, as notes
 * for the builder. Costs stay as Hero Designer works them out.
 */
export function modifierBookNotes(m: NotedModifier, power: PowerFacts): BookNote[] {
  const others = power.modifiers.filter((o) => o !== m) as NotedModifier[];
  const has = (id: string) => others.some((o) => o.xmlId === id);
  const find = (id: string) => others.find((o) => o.xmlId === id);
  const adder = (id: string) => m.adders?.find((a) => a.xmlId === id);
  const xml = power.xmlId ?? '';
  const template = TEMPLATE.get(xml);
  const duration = template ? effectiveDuration({ xmlId: xml, modifiers: others }) : undefined;
  const notes: BookNote[] = powerModifierNotes(m, power);
  const note = (page: number, text: string) => notes.push({ page, text });

  switch (m.xmlId) {
    case 'AUTOFIRE':
      if (has('AVAD') && !adder('ODDPOWER')) {
        note(327, 'Autofire on an AVAD or NND attack costs +1 more. Hero Designer and hero6e don\'t add it; tick "Non-Standard Attack Power" to pay it.');
      }
      if (has('DAMAGEOVERTIME')) note(330, 'Autofire on a Damage Over Time attack needs the GM\'s permission.');
      break;
    case 'PENETRATING':
      if (has('AVAD')) note(342, 'Penetrating can\'t be used with AVAD (or NND) attacks.');
      break;
    case 'SIDEEFFECTS':
      if (duration && duration !== 'INSTANT' && has('REQUIRESASKILLROLL') && !m.modifiers?.some((s) => s.xmlId === 'ALWAYSOCCURS')) {
        note(395, 'Side Effects on a Constant power that Requires A Roll is worth 1/4 more Limitation. Hero Designer doesn\'t add it.');
      }
      break;
    case 'REQUIRESASKILLROLL':
      if ((adder('BURNOUT') || adder('JAMMED')) && find('CHARGES')?.optionId === 'ONE') {
        note(391, 'Burnout and Jammed can\'t be taken for a power with only 1 Charge.');
      }
      if (adder('EVERYPHASE') && duration === 'INSTANT') note(391, 'A roll made each Phase is only for Constant or Persistent powers; Instant powers roll once.');
      break;
    case 'CHARGES':
      if (adder('CONTINUING') && duration === 'INSTANT' && !has('TIMELIMIT')) note(369, 'Continuing Charges are only for Constant or Persistent powers.');
      break;
    case 'RANGED':
      if (xml === 'STR') note(344, 'STR can\'t be bought Ranged; use Telekinesis or Stretching.');
      break;
    case 'LINKED': {
      if (!m.linkedId) {
        note(383, 'Choose the power this one is Linked to.');
        break;
      }
      const target = power.characterItems?.find((p) => p.id === m.linkedId);
      if (target && target.modifiers.some((o) => o.xmlId === 'LOS') !== (has('LOS') || template?.range === 'LOS')) {
        note(384, 'If one of two Linked powers has Line Of Sight, the other must have it too.');
      }
      break;
    }
    case 'OIHID':
      if (has('FOCUS')) note(387, 'A power usually can\'t take both Only In Alternate Identity and Focus.');
      if (find('EXTRATIME')?.optionId === 'FULL') note(387, 'A power usually can\'t take both Only In Alternate Identity and Extra Time (Full Phase).');
      break;
    case 'RESTRAINABLE': {
      const focus = find('FOCUS')?.optionId;
      if (focus === 'IAF' || focus === 'OAF') note(393, 'A Restrainable power shouldn\'t also have an Accessible Focus, which Grabs and Entangles already deprive the character of.');
      break;
    }
    case 'UOO':
      if (xml === 'REGENERATION') note(360, 'Regeneration can\'t be Usable On Others; buy Healing instead.');
      if (CHARACTERISTICS.includes(xml)) note(360, 'Characteristics need the GM\'s permission to be Usable On Others; Aid is the usual way.');
      if (has('SELFONLY') || has('ONLYSELF')) note(360, 'A power with Self Only can\'t be Usable On Others.');
      break;
    case 'UNIFIEDPOWER':
      if (power.characterItems && !power.characterItems.some((p) => p.modifiers.some((o) => o.xmlId === 'UNIFIEDPOWER'))) {
        note(395, 'Unified Power must be taken for at least two abilities.');
      }
      break;
    case 'TRIGGER':
      if (adder('MULTIPLE') && !has('FOCUS') && !has('CHARGES')) note(352, 'A Trigger can only be set multiple times on a power with Focus or Charges.');
      break;
    case 'EXTRATIME':
      if (adder('NOOTHERACTIONS') && template?.types?.includes('ATTACK')) {
        note(374, '"Character may take no other actions" is for non-attack powers; an attack with Extra Time already stops other attacks.');
      }
      break;
    case 'NONPERSISTENT':
      if (has('COSTSEND')) note(373, 'A Persistent power that Costs Endurance is already Constant, so it can\'t also take Nonpersistent.');
      break;
  }
  return notes;
}

// ============================================================================
// Chapter Five: rules for particular powers
// ============================================================================

/**
 * Modifiers 6E1's power descriptions rule out (or put to the GM) for a particular power, as
 * [power, modifier, page, note, applies?]. Boost is Aid, and Suppress is Drain, that Costs END to
 * maintain.
 */
const POWER_MODIFIER_NOTES: [string, string, number, string, ((m: NotedModifier, others: NotedModifier[]) => boolean)?][] = [
  ['AID', 'COSTSENDONLYTOACTIVATE', 168, 'Boost (Aid that Costs END to maintain) can\'t take Costs END Only To Activate.', (_, o) => o.some((x) => x.xmlId === 'COSTSENDTOMAINTAIN')],
  ['AID', 'REDUCEDEND', 168, 'Boost (Aid that Costs END to maintain) needs the GM\'s permission for Reduced Endurance.', (_, o) => o.some((x) => x.xmlId === 'COSTSENDTOMAINTAIN')],
  ['DRAIN', 'COSTSENDONLYTOACTIVATE', 197, 'Suppress (Drain that Costs END to maintain) can\'t take Costs END Only To Activate.', (_, o) => o.some((x) => x.xmlId === 'COSTSENDTOMAINTAIN')],
  ['DRAIN', 'REDUCEDEND', 197, 'Suppress (Drain that Costs END to maintain) needs the GM\'s permission for Reduced Endurance.', (_, o) => o.some((x) => x.xmlId === 'COSTSENDTOMAINTAIN')],
  ['DARKNESS', 'AOE', 187, 'Darkness already covers a radius, so it can\'t buy Area Of Effect (Radius); another shape is fine, bought up to the size wanted.', (m) => m.optionId === 'RADIUS'],
  ['MISSILEDEFLECTION', 'AOE', 187, 'Area Of Effect on Deflection (to Deflect any attack through an area) needs the GM\'s permission.'],
  ['MISSILEDEFLECTION', 'UNCONTROLLED', 187, 'Uncontrolled Deflection needs the GM\'s permission and a common, obvious way to bypass or turn it off.'],
  ['DESOLIDIFICATION', 'VARIABLESFX', 192, 'Variable Special Effects can\'t change what a Desolidified character is still vulnerable to.'],
  ['ENTANGLE', 'AVAD', 218, 'Entangle can\'t take Attack Versus Alternate Defense.'],
  ['ENTANGLE', 'CUMULATIVE', 218, 'Entangle can\'t take Cumulative.'],
  ['ENTANGLE', 'PERSONALIMMUNITY', 219, 'Entangle can\'t take Personal Immunity.'],
  ['EXTRALIMBS', 'INVISIBLE', 224, 'Invisible Power Effects on Extra Limbs needs the GM\'s permission; a limb is perceivable by definition.'],
  ['HEALING', 'PERSISTENT', 235, 'Healing can\'t be Persistent; a healing power that never stops is Regeneration.'],
  ['HEALING', 'AOE', 235, 'Area Of Effect Healing needs the GM\'s permission.'],
  ['LEAPING', 'UOO', 244, 'Leaping can\'t be Usable As Attack; that effect is Telekinesis.', (m) => m.optionId === 'UAA'],
  ['REFLECTION', 'AOE', 273, 'Area Of Effect on Reflection (to Reflect any attack through an area) needs the GM\'s permission.'],
  ['REFLECTION', 'RANGED', 273, 'Reflection can\'t be bought Ranged.'],
  ['REFLECTION', 'VARIABLEADVANTAGE', 273, 'Variable Advantage on Reflection can\'t change the Advantages of a Reflected attack.'],
  ['REFLECTION', 'VARIABLESFX', 273, 'Variable Special Effects on Reflection can\'t change a Reflected attack\'s special effect.'],
  ['MULTIFORM', 'UOO', 270, 'Multiform shouldn\'t be Usable On Others to force a change of shape on someone.'],
  ['SHAPESHIFT', 'UOO', 280, 'Shape Shift can\'t be Usable On Others to force a change of shape on someone.'],
  ['STRETCHING', 'AOE', 286, 'Stretching can\'t take Area Of Effect.'],
  ['SUMMON', 'PERSONALIMMUNITY', 291, 'Summon can\'t take Personal Immunity to stop a Summoned being harming the Summoner.'],
  ['TELEKINESIS', 'AVAD', 296, 'Attack Versus Alternate Defense on Telekinesis needs the GM\'s permission (and definition of its effects).'],
  ['TELEKINESIS', 'CUMULATIVE', 296, 'Telekinesis can\'t take Cumulative.'],
  ['TELEKINESIS', 'NORANGE', 296, 'Telekinesis normally shouldn\'t take No Range; buy extra STR instead.'],
  ['TELEPORTATION', 'TRANSDIMENSIONAL', 303, 'Teleportation can\'t be Transdimensional; travel to other dimensions is Extra-Dimensional Movement.'],
  ['TELEPATHY', 'SURFACEONLY', 299, 'Surface Thoughts Only can\'t be combined with Communication Only without the GM\'s permission.', (_, o) => o.some((x) => x.xmlId === 'COMMUNICATIONONLY')],
  ['RKA', 'INCREASEDSTUNMULTIPLIER', 242, 'More than one Increased STUN Multiplier on an attack needs the GM\'s permission.', (m) => (m.levels ?? 1) > 1],
  ['HKA', 'INCREASEDSTUNMULTIPLIER', 242, 'More than one Increased STUN Multiplier on an attack needs the GM\'s permission.', (m) => (m.levels ?? 1) > 1],
  ['RKA', 'DECREASEDSTUNMULTIPLIER', 242, 'Decreased STUN Multiplier can be taken at most twice.', (m) => (m.levels ?? 1) > 2],
  ['HKA', 'DECREASEDSTUNMULTIPLIER', 242, 'Decreased STUN Multiplier can be taken at most twice.', (m) => (m.levels ?? 1) > 2],
];

/** Notes from the power's own description for one of its modifiers */
function powerModifierNotes(m: NotedModifier, power: PowerFacts): BookNote[] {
  const others = power.modifiers.filter((o) => o !== m) as NotedModifier[];
  return POWER_MODIFIER_NOTES.filter(([p, id, , , applies]) => p === power.xmlId && id === m.xmlId && (!applies || applies(m, others))).map(
    ([, , page, text]) => ({ page, text }),
  );
}

/** What a power, apart from its modifiers, needs by its description */
export interface PowerNoteFacts extends PowerFacts {
  /** What it affects or works against (Hero Designer's INPUT): Drain STR, Blast vs ED */
  input?: string;
  levels?: number;
  /** The framework it's a slot in */
  framework?: 'MULTIPOWER' | 'VPP';
}

/** Change Environment's adders that are combat effects (the rest are Alterable Origin and the like) */
const NOT_COMBAT_EFFECTS = ['ALTERABLEORIGIN', 'REDUCEDNEGATION', 'VARYINGCOMBATEFFECTS', 'LONG'];

/**
 * Rules for the power itself from its 6E1 description that Hero Designer doesn't check, as notes:
 * what it must name, its minimum, and whether it suits a Power Framework
 */
export function powerBookNotes(power: PowerNoteFacts): BookNote[] {
  const xml = power.xmlId ?? '';
  const template = TEMPLATE.get(xml);
  const input = (power.input ?? '').trim();
  const has = (id: string) => power.modifiers.some((m) => m.xmlId === id);
  const notes: BookNote[] = [];
  const note = (page: number, text: string) => notes.push({ page, text });

  if (power.framework && template?.types?.includes('SPECIAL')) {
    note(161, `${template.display} is a Special Power; it needs the GM's permission to be bought in a Power Framework.`);
  }
  const mustName: Record<string, [number, string]> = {
    DRAIN: [195, 'Name the Characteristic or Power the Drain affects.'],
    AID: [167, 'Name the Characteristic(s) or Power(s) the Aid increases.'],
    HEALING: [232, 'Name the Characteristic(s) or Power(s) the Healing restores.'],
    DISPEL: [193, 'Name the Power the Dispel affects.'],
    ENERGYBLAST: [174, 'Say whether the Blast works against PD or ED.'],
    RKA: [241, 'Say whether the Killing Attack works against Resistant PD or ED.'],
    HKA: [241, 'Say whether the Killing Attack works against Resistant PD or ED.'],
  };
  if (mustName[xml] && !input) note(...mustName[xml]);
  if (xml === 'DISPEL' && CHARACTERISTICS.includes(input.toUpperCase())) note(193, 'Dispel can\'t affect Characteristics; Drain does that.');
  if (xml === 'DRAIN' && input.toUpperCase() === 'BODY' && has('AVAD') && !has('DOESBODY')) {
    note(196, 'A Drain BODY with Attack Versus Alternate Defense must also have Does BODY.');
  }
  if (xml === 'TELEKINESIS' && (power.levels ?? 0) < 2) note(294, 'Telekinesis needs at least 2 STR.');
  if (xml === 'CHANGEENVIRONMENT' && !(power.adders ?? []).some((a) => !NOT_COMBAT_EFFECTS.includes(a))) {
    note(174, 'A Change Environment needs at least one combat effect.');
  }
  return notes;
}
