/**
 * HERO System build text → Hero Workshop power drafts, priced with Hero Workshop's catalogs
 * (generated from Hero Designer's Main6E.hdt) and its editor's cost rules.
 *
 *   "RKA 1d6, Armor Piercing (+¼), Area Of Effect (1m Radius; +¼) (22 Active Points);
 *    OAF (Powerstone; -1), Requires A Roll (Skill roll; Earth Magic Casting; -½), Gestures (-¼)"
 *
 * The power phrase comes first: the power's name and its levels (dice, meters, points, a
 * characteristic's +N), then its adders. Each modifier is "Name (detail; value)"; sheet
 * notation ("Name [+1/4]", "Name -½") is accepted too. A modifier's value is always the one the
 * text gives, so costs follow the sheet; its XMLID, option and adders come from the catalog.
 * Anything not recognized becomes a custom modifier (or a custom power) and is reported.
 */

import { hw } from './shared.mjs';

// =============================================================================
// Text helpers
// =============================================================================

const FRACTION = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const GLYPH = { '1/4': '¼', '1/2': '½', '3/4': '¾' };

export const norm = (s) =>
  String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Sheet notation → book notation: "[+1/4]" → "(+¼)", "-1 1/2" → "-1½", dashes → "-",
 * "[detail; -1/2]" → "(detail; -½)"
 */
export function normalizeBuild(text) {
  return String(text ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\s+(1\/4|1\/2|3\/4)/g, (_, n, f) => `${n}${GLYPH[f]}`)
    .replace(/\b(1\/4|1\/2|3\/4)\b/g, (f) => GLYPH[f])
    .replace(/\[([^\[\]]*)\]/g, (m, inner) => (/[+-]\s*\d*[¼½¾]?\s*$/.test(inner) && valueOf(inner.split(';').at(-1)) !== undefined ? `(${inner})` : m))
    .trim();
}

/** Splits at any of `seps` outside parentheses and brackets */
export function splitTop(text, seps = [',', ';']) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && seps.includes(c)) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** "+¼", "-1½", "-0", "+2" → number; undefined if it isn't a modifier value */
export function valueOf(text) {
  const m = /^\s*([+-])\s*(\d+)?\s*([¼½¾])?\s*$/.exec(String(text ?? ''));
  if (!m || (m[2] === undefined && !m[3])) return undefined;
  const n = Number(m[2] ?? 0) + (FRACTION[m[3]] ?? 0);
  return m[1] === '+' ? n : -n;
}

/** The parenthesized group that ends `text`: its start index, or -1 */
function finalGroup(text) {
  if (!text.endsWith(')')) return -1;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ')') depth++;
    else if (text[i] === '(' && --depth === 0) return i;
  }
  return -1;
}

/**
 * "Name (detail; -½)", "Name (-½)" or "Name -½" → { name, detail, value }; undefined when the
 * piece carries no value (it's part of the power's own text)
 */
export function parseModifierPiece(piece) {
  const text = piece.trim().replace(/\.$/, '');
  const open = finalGroup(text);
  if (open >= 0) {
    const parts = splitTop(text.slice(open + 1, -1), [';']);
    const value = valueOf(parts.at(-1));
    if (value !== undefined) return { name: text.slice(0, open).trim(), detail: parts.slice(0, -1).join('; '), value };
  }
  // A trailing value without parentheses: "Requires An EGO Roll -½" (a bare "+2" is a quantity: "Telescopic +2")
  const bare = /^(.*\S)\s+([+-]\s*\d*[¼½¾]?)$/.exec(text);
  if (bare && valueOf(bare[2]) !== undefined && (valueOf(bare[2]) < 0 || /[¼½¾]/.test(bare[2]))) {
    const name = bare[1].trim();
    const inner = finalGroup(name);
    if (inner > 0) return { name: name.slice(0, inner).trim(), detail: name.slice(inner + 1, -1).trim(), value: valueOf(bare[2]) };
    return { name, detail: '', value: valueOf(bare[2]) };
  }
  return undefined;
}

let lastId = 0;
/** Model ids for new objects; the HDC writer assigns the file's numeric IDs */
export const newId = (prefix = 'new') => `${prefix}-${++lastId}`;

// =============================================================================
// Modifiers
// =============================================================================

/** Names sheets and books use that differ from Hero Designer's */
const MODIFIER_SYNONYMS = {
  'requires a magic roll': 'REQUIRESASKILLROLL',
  'requires a skill roll': 'REQUIRESASKILLROLL',
  'requires a roll': 'REQUIRESASKILLROLL',
  'skill roll': 'REQUIRESASKILLROLL',
  'magic roll': 'REQUIRESASKILLROLL',
  'activation roll': 'REQUIRESASKILLROLL',
  'activation': 'REQUIRESASKILLROLL',
  'act': 'REQUIRESASKILLROLL',
  'area of effect': 'AOE',
  'aoe': 'AOE',
  'ap': 'ARMORPIERCING',
  'armor piercing': 'ARMORPIERCING',
  'armour piercing': 'ARMORPIERCING',
  'reduced endurance': 'REDUCEDEND',
  'reduced end': 'REDUCEDEND',
  'no end': ['REDUCEDEND', 'ZERO'],
  '0 end': ['REDUCEDEND', 'ZERO'],
  'zero end': ['REDUCEDEND', 'ZERO'],
  'half end': ['REDUCEDEND', 'HALFEND'],
  '½ end': ['REDUCEDEND', 'HALFEND'],
  'costs end': 'COSTSEND',
  'costs endurance': 'COSTSEND',
  'constant': 'CONTINUOUS',
  'side effect': 'SIDEEFFECTS',
  'side effects': 'SIDEEFFECTS',
  'range based on str': 'RANGEBASEDONSTR',
  'no range': 'NORANGE',
  'usable by other': ['UOO', 'UBO'],
  'usable by others': ['UOO', 'UBO'],
  'usable on other': ['UOO', 'UOO'],
  'usable on others': ['UOO', 'UOO'],
  'usable simultaneously': ['UOO', 'SIMULTANEOUSLY'],
  'usable by nearby': ['UOO', 'UNB'],
  'usable as attack': ['UOO', 'UAA'],
  'expanded class': 'EXPANDEDCLASS',
  'megaarea': 'MEGASCALE',
  'mega area': 'MEGASCALE',
  'mega scale': 'MEGASCALE',
  'megascale': 'MEGASCALE',
  'precognition only': 'PRECOGNITIONONLY',
  'retrocognition only': 'PRECOGNITIONONLY',
  'increased stun multiplier': 'INCREASEDSTUNMULTIPLIER',
  'costs half endurance': ['COSTSEND', 'HALFEND'],
  'full phase': ['EXTRATIME', 'FULL'],
  'extra time': 'EXTRATIME',
  'spell': 'SPELL',
};

function modifierIndex(powerXmlId) {
  const index = new Map();
  for (const def of Object.values(hw.getAllModifiers())) index.set(norm(def.display), def);
  // A power's own definitions win (Drain's Costs Endurance (to maintain))
  for (const def of hw.powerSpecificModifiers(powerXmlId)) index.set(norm(def.display), def);
  return index;
}

/** Limitations worded as a condition, which 6E builds as Limited Power; named ones stay custom */
const LIMITED_POWER = /^(only|not|no|never|must|will not|won't|does not|doesn't|cannot|can't|when|while|unless|limited|requires|power (stops|fails|loses))\b/i;

/** Leveled modifiers hero6e prices from BASECOST alone (no cost per level) */
const VALUE_ONLY = new Set(['DELAYEDEFFECT', 'VARIABLEADVANTAGE']);

const FOCUS = /^(OAF|OIF|IAF|IIF|Obvious Accessible Focus|Obvious Inaccessible Focus|Inobvious Accessible Focus|Inobvious Inaccessible Focus|Focus)\b\s*(.*)$/i;
const FOCUS_KINDS = { 'obvious accessible focus': 'OAF', 'obvious inaccessible focus': 'OIF', 'inobvious accessible focus': 'IAF', 'inobvious inaccessible focus': 'IIF' };
const CHARGES = /^(\d+)\s+(Continuing\s+|Recoverable\s+)?(Fuel\s+)?Charges?\b(.*)$/i;

function modifier(def, value, o = {}) {
  return {
    id: newId('mod'),
    xmlId: def?.xmlId ?? 'CUSTOM',
    name: o.alias ?? def?.display ?? o.name,
    alias: o.alias ?? def?.display ?? o.name,
    value,
    isAdvantage: value > 0,
    isLimitation: value < 0,
    levels: o.levels,
    optionId: o.option?.xmlId ?? o.optionId,
    optionAlias: o.optionAlias ?? o.option?.display,
    input: o.input,
    comments: o.comments || undefined,
    adders: o.adders,
  };
}

const modAdder = (xmlId, baseCost, alias, o = {}) => ({
  id: newId('adder'), xmlId, name: alias, alias, baseCost, optionAlias: o.optionAlias, includeInBase: !!o.includeInBase, selected: true,
});

/** The option whose display best matches the detail text, or whose value matches */
function pickOption(def, detail, value) {
  const d = norm(detail);
  const byText = (def.options ?? []).find((o) => d && (d.startsWith(norm(o.display)) || norm(o.display).startsWith(d) || d.includes(norm(o.display))));
  return byText ?? (def.options ?? []).find((o) => o.baseCost === value);
}

/** Requires A Roll: a skill roll (bound to `skill`), a characteristic roll, or a fixed roll */
function requiresARoll(def, name, detail, value, defaults) {
  const text = `${name} ${detail}`;
  const per = /-1 per (5|20) Active Points/i.exec(text)?.[1];
  const variant = per ? `1PER${per}` : '';
  const fixed = /\b(8|9|10|11|12|13|14)-/.exec(text);
  const characteristic = /\b(STR|DEX|CON|INT|EGO|PRE)\b(?:\s+roll|-based)/i.exec(text) ?? /^requires an? (STR|DEX|CON|INT|EGO|PRE) roll$/i.exec(name.trim());
  const percept = /\b(PER|Perception)\s+roll/i.test(text);
  const rest = detail
    .replace(/,?\s*-1 per (5|20) Active Points( modifier)?/i, '')
    .replace(/\b(Skill roll|Magic roll)\b;?/i, '')
    .replace(/^[,;\s]+|[,;\s]+$/g, '');
  // The skill: named in the text ("Skill Roll: Earth Magic Casting", "Requires A Stealth Roll"), or the default
  const named = /^requires an? (.+?) roll$/i.exec(name.trim())?.[1];
  const colon = /^[^:]+:\s*(.+)$/.exec(name)?.[1];
  let skill = colon ?? (named && !/^(skill|magic)$/i.test(named) ? named : undefined) ?? rest.split(/[;,]/)[0]?.trim();
  // "11-", "EGO roll", "PER roll" aren't skills
  if (!skill || /^(to |no active|when|only|-1)/i.test(skill) || /^\d+-$/.test(skill) || /^(STR|DEX|CON|INT|EGO|PRE|PER|Perception)\b/i.test(skill)) skill = undefined;
  if (named && /^(STR|DEX|CON|INT|EGO|PRE)$/i.test(named)) skill = undefined;
  if (/^magic$/i.test(named ?? '') || /magic roll/i.test(text)) skill ??= defaults.magicSkill;
  skill ??= defaults.skillRoll;

  if (characteristic && !skill) {
    const option = def.options?.find((o) => o.xmlId === `CHAR${variant}`);
    // hero6e rolls against the characteristic COMMENTS names, so it holds just the key
    return modifier(def, value, { option, optionAlias: `${characteristic[1].toUpperCase()} Roll`, comments: characteristic[1].toUpperCase() });
  }
  if (percept) {
    const option = def.options?.find((o) => o.xmlId === `PER${variant}`);
    return modifier(def, value, { option, comments: rest });
  }
  if (fixed && !skill) {
    const option = def.options?.find((o) => o.xmlId === fixed[1]);
    return modifier(def, value, { option, comments: rest });
  }
  const option = def.options?.find((o) => o.xmlId === `SKILL${variant}`);
  return {
    ...modifier(def, value, { option, optionAlias: skill ? `${skill} roll${per ? `, -1 per ${per} Active Points modifier` : ''}` : option?.display, comments: skill ?? rest }),
    // Bound to the character's skill (and its roll category) once the skills exist
    bindSkill: skill,
  };
}

/**
 * A modifier piece { name, detail, value } as a Hero Workshop Modifier, plus anything worth
 * reviewing. `context.powerXmlId` lets a power's own modifiers match; `context.magicSkill` and
 * `context.skillRoll` name the skill a Requires A Roll uses when the text doesn't.
 */
export function buildModifier({ name, detail = '', value }, context = {}) {
  const powerXmlId = context.powerXmlId;
  const comments = detail;

  const focus = FOCUS.exec(name);
  if (focus) {
    const def = hw.getModifierByXmlId('FOCUS');
    let kind = FOCUS_KINDS[focus[1].toLowerCase()] ?? focus[1].toUpperCase();
    if (kind === 'FOCUS') kind = /\bOIF\b/i.test(detail) ? 'OIF' : /\bIIF\b/i.test(detail) ? 'IIF' : /\bIAF\b/i.test(detail) ? 'IAF' : 'OAF';
    const option = def.options.find((o) => o.xmlId === kind);
    const extra = `${focus[2]} ${detail}`.toLowerCase();
    const adders = [];
    if (/expendable/.test(extra)) {
      const [id, cost, label] = /extremely difficult/.test(extra) ? ['EXTREMELYDIFFICULT', -1, 'Extremely Difficult to obtain']
        : /very difficult/.test(extra) ? ['VERYDIFFICULT', -0.5, 'Very Difficult to obtain']
          : /difficult/.test(extra) ? ['DIFFICULT', -0.25, 'Difficult to obtain'] : ['EASY', 0, 'Easy to obtain'];
      adders.push({ ...modAdder('EXPENDABILITY', cost, 'Expendability', { optionAlias: label }), optionId: id });
    }
    if (/fragile/.test(extra)) adders.push(modAdder('BREAKABILITY', -0.25, 'Breakability', { optionAlias: 'Fragile' }));
    if (/bulky/.test(extra)) adders.push(modAdder('MOBILITY', -0.5, 'Mobility', { optionAlias: 'Bulky' }));
    if (/immobile/.test(extra)) adders.push(modAdder('MOBILITY', -1, 'Mobility', { optionAlias: 'Immobile' }));
    return { modifier: modifier(def, value, { alias: 'Focus', option, optionAlias: kind, comments: detail.replace(/\b(OAF|OIF|IAF|IIF)\b;?\s*/g, '').trim(), adders }) };
  }

  const charges = CHARGES.exec(name);
  if (charges) {
    const count = Number(charges[1]);
    const def = hw.getModifierByXmlId('CHARGES');
    const option = [...def.options].reverse().find((o) => Number(o.display.match(/^\d+/)?.[0]) <= count) ?? def.options[0];
    return {
      modifier: modifier(def, value, {
        option, optionAlias: String(count),
        comments: [charges[2]?.trim(), charges[3]?.trim(), charges[4]?.trim(), detail].filter(Boolean).join('; '),
      }),
    };
  }

  // No Normal Defense: Attack Versus Alternate Defense, Very Common -> Rare, All Or Nothing
  if (/^NND$|^No Normal Defense$/i.test(name.trim())) {
    const def = hw.getModifierByXmlId('AVAD');
    const option = def.options.find((o) => o.xmlId === hw.NND.option);
    return {
      modifier: modifier(def, value, {
        option, input: detail.replace(/^(the )?defense is\s*/i, '') || undefined,
        adders: [modAdder(hw.NND.adder, -0.5, 'All Or Nothing')],
      }),
      review: value === 1 ? undefined : `NND at ${value}: check`,
    };
  }
  if (/^AVAD$|^Attack Versus Alternate Defense$/i.test(name.trim())) {
    const def = hw.getModifierByXmlId('AVAD');
    const option = pickOption(def, detail, value);
    return { modifier: modifier(def, value, { option, input: detail }) };
  }

  const index = modifierIndex(powerXmlId);
  // "+2 Increased STUN Multiplier": the number is the levels
  const leading = /^\+(\d+)\s+(.*)$/.exec(name);
  const bareName = leading ? leading[2] : name;
  let key = norm(bareName);
  // "Skill Roll: Earth Magic Casting", "Limited Power: only in daylight"
  const colon = /^([^:]+):\s*(.+)$/.exec(bareName);
  if (!MODIFIER_SYNONYMS[key] && !index.has(key) && colon) key = norm(colon[1]);
  const synonym = MODIFIER_SYNONYMS[key];
  const [synId, synOption] = Array.isArray(synonym) ? synonym : [synonym];
  let def = synId ? hw.modifierFor(synId, powerXmlId) : index.get(key);
  if (def?.xmlId === 'REQUIRESASKILLROLL') return { modifier: requiresARoll(def, name, detail, value, context) };
  if (synOption && def) {
    const option = def.options?.find((o) => o.xmlId === synOption);
    return { modifier: modifier(def, value, { option, comments }) };
  }
  // Reduced Endurance by value: +¼ half, +½ zero
  if (def?.xmlId === 'REDUCEDEND') {
    const option = def.options?.find((o) => o.xmlId === (/zero|0 end|no end/i.test(detail) || value >= 0.5 ? 'ZERO' : 'HALFEND'));
    return { modifier: modifier(def, value, { option, comments: detail }) };
  }
  // "Costs Endurance (to maintain; -½)": the to-maintain form where one exists
  if (key === 'costs endurance' || key === 'costs end') {
    if (/maintain/i.test(detail)) def = hw.modifierFor('COSTSENDTOMAINTAIN', powerXmlId) ?? def;
  }
  // "Usable As Swimming": Usable [As Second Mode Of Movement]
  const usableAs = /^usable as (?:a )?(.+)$/i.exec(bareName);
  if (!def && usableAs) return { modifier: modifier(hw.getModifierByXmlId('USABLEAS'), value, { comments: [usableAs[1], detail].filter(Boolean).join('; ') }) };
  if (!def && value < 0 && LIMITED_POWER.test(bareName)) {
    // A condition Hero Designer has no entry for ("Only vs fire", "Must drink blood"): its Limited Power
    const limited = hw.getModifierByXmlId('LIMITEDPOWER');
    const option = limited.options?.find((o) => o.baseCost === value);
    return {
      modifier: modifier(limited, value, { option, comments: [bareName, detail].filter(Boolean).join('; ') }),
      review: `Limited Power "${bareName}"`,
    };
  }
  if (!def) {
    return {
      modifier: modifier(undefined, value, { name: bareName, alias: bareName, comments }),
      review: `custom ${value < 0 ? 'limitation' : 'advantage'} "${bareName}"`,
      custom: true,
    };
  }

  if (def.xmlId === 'AOE') {
    const m = /(\d+)\s*m(?:eters?)?\s+(Radius|Cone|Line|Surface|Any Area|rad\b)/i.exec(detail || name);
    if (m) {
      const shape = /^rad/i.test(m[2]) ? 'RADIUS' : m[2].toUpperCase().replace(' ', '');
      const meters = Number(m[1]);
      const option = def.options?.find((o) => o.xmlId === (shape === 'ANYAREA' ? 'ANY' : shape)) ?? def.options?.find((o) => norm(o.display).startsWith(norm(m[2])));
      if (option && hw.aoeValue(option.xmlId, meters) === value) {
        return { modifier: modifier(def, value, { option, levels: meters, comments: detail.replace(m[0], '').replace(/^[;,\s]+/, '') || undefined }) };
      }
    }
    return {
      modifier: modifier(undefined, value, { name: `Area Of Effect (${detail})`, alias: `Area Of Effect (${detail})` }),
      review: `Area Of Effect "${detail}" at ${value} doesn't fit Hero Designer's sizes: custom advantage`,
      custom: true,
    };
  }

  if (VALUE_ONLY.has(def.xmlId)) return { modifier: modifier(def, value, { comments }) };
  if (def.hasLevels && def.lvlCost) {
    const levels = (value - (def.baseCost ?? 0)) / def.lvlCost;
    if (Number.isInteger(levels) && levels >= 0) return { modifier: modifier(def, value, { levels, comments }) };
    return {
      modifier: modifier(undefined, value, { name: bareName, alias: bareName, comments }),
      review: `${bareName} (${value}) doesn't fit its levels: custom modifier`,
      custom: true,
    };
  }
  const option = def.options?.length ? pickOption(def, detail, value) : undefined;
  return { modifier: modifier(def, value, { option, comments: option && norm(detail).startsWith(norm(option.display)) ? undefined : comments }) };
}

// =============================================================================
// Powers
// =============================================================================

const CHARACTERISTICS = ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'RUNNING', 'SWIMMING', 'LEAPING'];

/** Names and abbreviations that differ from Hero Designer's displays */
const POWER_SYNONYMS = [
  ['killing attack - ranged', 'RKA'], ['ranged killing attack', 'RKA'], ['rka', 'RKA'],
  ['killing attack - hand-to-hand', 'HKA'], ['hand-to-hand killing attack', 'HKA'], ['hka', 'HKA'],
  ['energy blast', 'ENERGYBLAST'], ['eb', 'ENERGYBLAST'], ['ha', 'HANDTOHANDATTACK'], ['hth attack', 'HANDTOHANDATTACK'],
  ['mental blast', 'EGOATTACK'], ['ego attack', 'EGOATTACK'],
  ['major transform', 'TRANSFORM', 'MAJOR'], ['severe transform', 'TRANSFORM', 'SEVERE'], ['minor transform', 'TRANSFORM', 'MINOR'],
  ['cosmetic transform', 'TRANSFORM', 'COSMETIC'],
  ['simplified healing', 'HEALING'], ['boost', 'AID'], ['suppress', 'DRAIN'],
  ['resistant protection', 'FORCEFIELD'], ['force field', 'FORCEFIELD'], ['armor', 'FORCEFIELD'], ['armour', 'FORCEFIELD'],
  ['force wall', 'FORCEWALL'], ['tk', 'TELEKINESIS'], ['kb resistance', 'KBRESISTANCE'], ['knockback resistance', 'KBRESISTANCE'],
  ['missile deflection', 'MISSILEDEFLECTION'], ['ls', 'LIFESUPPORT'], ['life support', 'LIFESUPPORT'], ['enhanced senses', 'ENHANCEDPERCEPTION'],
  ['enhanced perception', 'ENHANCEDPERCEPTION'], ['partially penetrative', 'PARTIALLYPENETRATIVE'], ['partially penatrative', 'PARTIALLYPENETRATIVE'],
  ['infrared vision', 'INFRAREDPERCEPTION'], ['ultraviolet vision', 'ULTRAVIOLETPERCEPTION'],
  ['240 degree arc of perception', 'INCREASEDARC240'], ['360 degree arc of perception', 'INCREASEDARC360'],
  ['increased arc of perception (240 degrees)', 'INCREASEDARC240'], ['increased arc of perception (360 degrees)', 'INCREASEDARC360'],
  ['extra-dimensional movement', 'EXTRADIMENSIONALMOVEMENT'], ['endurance reserve', 'ENDURANCERESERVE'], ['end reserve', 'ENDURANCERESERVE'],
  ['flash defense', 'FLASHDEFENSE'], ['power defense', 'POWERDEFENSE'], ['mental defense', 'MENTALDEFENSE'],
  ['shape shift', 'SHAPESHIFT'], ['shapeshift', 'SHAPESHIFT'], ['density increase', 'DENSITYINCREASE'],
];

let powerNames;
/** Every power's display and abbreviation, plus the synonyms, longest first */
function powerNameIndex() {
  if (powerNames) return powerNames;
  const entries = [];
  for (const def of Object.values(hw.ALL_POWERS)) {
    if (['COMPOUNDPOWER', 'MULTIPOWER', 'CUSTOMPOWER'].includes(def.xmlId)) continue;
    entries.push({ name: def.display.replace(/^\+/, '').toLowerCase(), xmlId: def.xmlId });
    if (def.abbreviation) entries.push({ name: def.abbreviation.toLowerCase(), xmlId: def.xmlId });
  }
  for (const [name, xmlId, option] of POWER_SYNONYMS) entries.push({ name, xmlId, option });
  powerNames = entries.sort((a, b) => b.name.length - a.name.length);
  return powerNames;
}

/** Sense groups that lead or follow a power's name ("Sight Group Images", "Darkness to Sight Group") */
const SENSE = /\b(Sight|Hearing|Smell\/Taste|Touch|Mental|Radio|Unusual)(?: and (?:Sight|Hearing|Smell\/Taste|Touch|Mental|Radio))?(?: Groups?|Senses?)\b/i;
const SENSE_OPTIONS = {
  sight: 'SIGHTGROUP', hearing: 'HEARINGGROUP', mental: 'MENTALGROUP', 'smell/taste': 'SMELLGROUP', touch: 'TOUCHGROUP', radio: 'RADIOGROUP', unusual: 'UNUSUALGROUP',
};

const DICE = /(\d+)?\s*(½)?\s*d6\s*([+-]\s*1)?/i;

/** Where a power's name starts in `text`, and which power it is */
function findPowerName(text) {
  const lower = text.toLowerCase();
  for (const entry of powerNameIndex()) {
    const at = lower.indexOf(entry.name);
    if (at < 0) continue;
    const before = lower[at - 1];
    const after = lower[at + entry.name.length];
    if ((before === undefined || /[\s(+\-:,]|\d/.test(before)) && (after === undefined || /[\s(,:;\-\[]/.test(after))) {
      // A leading quantity or nothing but a sense group may precede the name
      const lead = text.slice(0, at).trim();
      if (lead && !/^[+-]?\d+[½]?\s*(m|meters?|pts?|points?|dc|d6|str|pd|ed)?\.?$/i.test(lead) && !SENSE.test(lead) && !/^\(\d+\)$/.test(lead)) continue;
      return { ...entry, at, lead, rest: text.slice(at + entry.name.length).trim() };
    }
  }
  return undefined;
}

/** Dice as Hero Designer writes them: "2½d6" adds ½d6, "2d6-1" is 1d6 with "+1d6 -1", "1d6+1" adds a pip */
function diceLevels(def, dice) {
  const d = Number(dice[1] ?? 0);
  const priced = (id) => {
    const a = def?.adders?.find((x) => x.xmlId === id);
    return a ? modAdder(id, a.baseCost, a.display, { includeInBase: true }) : undefined;
  };
  if (dice[3] && /-/.test(dice[3])) return { levels: d - 1, adders: [priced('MINUSONEPIP')].filter(Boolean) };
  if (dice[3]) return { levels: d, adders: [priced('PLUSONEPIP')].filter(Boolean) };
  if (dice[2]) return { levels: d, adders: [priced('PLUSONEHALFDIE')].filter(Boolean) };
  return { levels: d, adders: [] };
}

/** Sense modifiers that are Hero Designer powers of their own, priced as adders on a sense */
const SENSE_ADDERS = ['DISCRIMINATORY', 'ANALYZESENSE', 'RANGE', 'MAKEASENSE', 'TARGETINGSENSE', 'TRACKINGSENSE', 'INCREASEDARC240', 'INCREASEDARC360', 'TRANSMIT', 'PENETRATIVE', 'PARTIALLYPENETRATIVE', 'RAPID', 'MICROSCOPIC', 'TELESCOPIC'];
const SENSE_POWERS = new Set(['DETECT', 'NIGHTVISION', 'INFRAREDPERCEPTION', 'ULTRAVIOLETPERCEPTION', 'ULTRASONICPERCEPTION', 'RADAR', 'ACTIVESONAR', 'SPATIALAWARENESS', 'MENTALAWARENESS', 'HRRP', 'RADIOPERCEPTION', 'RADIOPERCEIVETRANSMIT', 'DANGER_SENSE', 'COMBAT_SENSE']);

/** A power's own adder named in `piece` ("Fine Manipulation", "Discriminatory", "+6 vs Range") */
function matchPowerAdder(def, piece) {
  const p = norm(piece);
  if (!p) return undefined;
  const number = /([+-]?\d+)/.exec(piece)?.[1];
  for (const a of def.adders ?? []) {
    const label = norm(a.display.replace(/\[LVL\]/g, ''));
    // Short labels ("PD") only match a whole "+N PD"
    const short = label.length < 3;
    if (short ? !new RegExp(`^[+-]?\\d+ ${label}$`).test(p) : !(p.includes(label) || (label.includes(p) && p.length >= 5))) continue;
    if (a.lvlCost) {
      const levels = Math.abs(Number(number ?? 1)) / (a.lvlVal || 1);
      return { ...modAdder(a.xmlId, a.baseCost ?? 0, a.display.replace(/\[LVL\]/g, number ?? ''), { includeInBase: true }), levels, lvlCost: a.lvlCost, lvlVal: a.lvlVal };
    }
    // An adder with choices ("Sleeping: character does not sleep") takes the one the text names
    const at = piece.toLowerCase().indexOf(label);
    const choice = a.options?.length ? pickOption(a, (at < 0 ? piece : piece.slice(at + label.length)).replace(/^[\s:(]+|[\s)]+$/g, '')) : undefined;
    if (choice) return { ...modAdder(a.xmlId, choice.baseCost ?? a.baseCost ?? 0, a.display, { includeInBase: true, optionAlias: choice.display }), optionId: choice.xmlId };
    return modAdder(a.xmlId, a.baseCost ?? 0, a.display, { includeInBase: true });
  }
  if (SENSE_POWERS.has(def.xmlId)) {
    for (const id of SENSE_ADDERS) {
      const sense = hw.getPowerDefinition(id);
      const label = norm(sense?.display);
      if (!sense || !(p.includes(label) || label.startsWith(p) && p.length >= 5)) continue;
      const option = sense.options?.find((o) => o.xmlId === 'SINGLE');
      if (option?.lvlCost) {
        const levels = Math.abs(Number(number ?? 2)) / (option.lvlVal || 1);
        return { ...modAdder(id, 0, `${sense.display} +${number ?? 2}`, { includeInBase: true }), levels, lvlCost: option.lvlCost, lvlVal: option.lvlVal };
      }
      return modAdder(id, option?.baseCost ?? sense.baseCost ?? 0, sense.display, { includeInBase: true });
    }
  }
  return undefined;
}

/**
 * The power phrase: { xmlId, option, levels, input, adders, extra, unread }. `pieces` are the
 * phrase's comma-separated parts (the first names the power).
 */
export function readPower(pieces) {
  const head = pieces[0] ?? '';
  // Combat Skill Levels: "+2 with Grabs", "+1 OCV with Swords and Knives", "+3 with all attacks"
  const csl = /^\+(\d+)\s*(?:OCV\s*)?(?:CSLs?\s*)?(?:with|w\/?)\s+(.+)$/i.exec(head);
  if (csl) {
    const target = csl[2].trim();
    const option = /\ball (?:attacks|combat)\b/i.test(target) ? 'ALL' : /\b(hth|hand-to-hand|melee)\b/i.test(target) ? 'HTH'
      : /\branged\b/i.test(target) ? 'RANGED' : /\band\b|,|\bgroup\b/i.test(target) ? 'TIGHT' : 'SINGLE';
    return { xmlId: 'COMBAT_LEVELS', levels: Number(csl[1]), option, input: target, adders: [], extra: pieces.slice(1), unread: [] };
  }
  // Characteristics: "+30 PRE", "+5 DEX"
  const ch = /^([+-]?\d+)\s+(STR|DEX|CON|INT|EGO|PRE|OCV|DCV|OMCV|DMCV|SPD|PD|ED|REC|END|BODY|STUN)\b(.*)$/i.exec(head);
  if (ch) return { xmlId: ch[2].toUpperCase(), levels: Number(ch[1]), adders: [], extra: [ch[3], ...pieces.slice(1)].map((s) => s.trim()).filter(Boolean), unread: [] };

  const found = findPowerName(head);
  if (!found) return undefined;
  const def = hw.getPowerDefinition(found.xmlId);
  const out = { xmlId: found.xmlId, option: found.option, levels: 0, adders: [], extra: [], unread: [], input: undefined };
  let rest = found.rest;
  const sense = SENSE.exec(`${found.lead} ${rest}`);
  if (sense) out.sense = sense[0];

  // A quantity naming one of the power's leveled adders ("Damage Negation (4 Physical DCs)") is that adder's levels
  const leveledAdder = (piece) => {
    const m = /^[(\s]*(\d+)\s+(.+?)[)\s]*$/.exec(piece);
    if (!m || !def?.adders?.length) return undefined;
    const a = def.adders.find((x) => x.lvlCost && norm(x.display.replace(/\[LVL\]/g, '')).includes(norm(m[2])) && norm(m[2]).length >= 3);
    return a ? { ...modAdder(a.xmlId, a.baseCost ?? 0, a.display.replace(/\[LVL\]/g, m[1]), { includeInBase: true }), levels: Number(m[1]) / (a.lvlVal || 1), lvlCost: a.lvlCost, lvlVal: a.lvlVal } : undefined;
  };
  const inner = /^\(([^()]*)\)$/.exec(rest.trim())?.[1];
  if (inner !== undefined && def?.adders?.some((a) => a.lvlCost)) {
    const parts = splitTop(inner, [',', ';']);
    const adders = parts.map(leveledAdder);
    if (adders.length && adders.every(Boolean)) {
      out.adders.push(...adders);
      out.levelsInAdders = true;
      rest = '';
    }
  }
  // A list of the power's own adders: "Life Support (Self-Contained Breathing, Safe in Intense Cold)"
  if (rest && inner !== undefined && def?.adders?.length) {
    const parts = splitTop(inner, [',', ';']).map((p) => p.trim()).filter(Boolean);
    const adders = parts.length > 1 ? parts.map((p) => leveledAdder(p) ?? matchPowerAdder(def, p)) : [];
    if (adders.length && adders.every(Boolean)) {
      out.adders.push(...adders);
      rest = '';
    }
  }
  // Damage Reduction's option names its percentage and kind ("Physical, 50% Resistant")
  if (found.xmlId === 'DAMAGEREDUCTION' && !out.option) {
    const pct = /(25|50|75)\s*%/.exec(`${found.lead} ${rest}`)?.[1];
    const kind = /mental/i.test(rest) ? 'MENTAL' : /resistant/i.test(rest) ? 'RESISTANT' : 'NORMAL';
    if (pct) {
      out.option = `LVL${pct}${kind}`;
      out.input = /mental/i.test(rest) ? undefined : /energy/i.test(rest) ? 'Energy' : /physical/i.test(rest) ? 'Physical' : undefined;
      rest = '';
    }
  }

  // Levels: a leading quantity ("5 Power Defense", "-12m Knockback Resistance", "20m Flight")
  const leadNumber = /([+-]?\d+)(½)?/.exec(found.lead ?? '');
  const leadDice = DICE.exec(found.lead ?? '');
  if (leadDice && /d6/i.test(found.lead)) {
    Object.assign(out, diceLevels(def, leadDice));
  } else if (leadNumber) {
    out.levels = Math.abs(Number(leadNumber[1]));
  }
  // Adjustment powers name their target: "Aid STR 3d6", "Drain CON 2d6"
  const dice = DICE.exec(rest);
  if (!out.levels && dice && /d6/i.test(dice[0]) && (dice.index < 3 || ['AID', 'DRAIN', 'HEALING', 'ABSORPTION', 'DISPEL', 'TRANSFORM', 'ENTANGLE', 'FLASH'].includes(found.xmlId))) {
    const target = rest.slice(0, dice.index).trim().replace(/[,:]$/, '').replace(/^[:\s]+/, '');
    Object.assign(out, diceLevels(def, dice));
    if (target && !SENSE.test(target)) out.input = target;
    rest = rest.slice(dice.index + dice[0].length).trim();
  } else if (!out.levels) {
    const pded = /^\(?(\d+)\s*(?:r?PD)\s*\/\s*(\d+)\s*(?:r?ED)\)?/i.exec(rest);
    const amount = /^[(:\s-]*([+-]?\d+)(½)?\s*(m\b|meters?|pts?\b|points?|str\b|dcs?\b|body\b|active points)?\)?/i.exec(rest);
    if (pded && found.xmlId === 'FORCEFIELD') {
      out.levels = Number(pded[1]) + Number(pded[2]);
      out.barrier = { pd: Number(pded[1]), ed: Number(pded[2]) };
      rest = rest.slice(pded[0].length).trim();
    } else if (amount && !/active points/i.test(amount[3] ?? '')) {
      out.levels = Math.abs(Number(amount[1]));
      rest = rest.slice(amount[0].length).trim();
    }
  }
  if (!out.levels && rest) {
    // A radius or distance after other words: "Darkness to Sight Group 2m radius"
    const meters = /(\d+)\s*m(?:eters?)?\b/i.exec(rest);
    if (meters && def?.lvlCost) {
      out.levels = Number(meters[1]);
      rest = (rest.slice(0, meters.index) + rest.slice(meters.index + meters[0].length)).trim();
    }
  }

  // Options: Transform's degree, Detect's class, Absorption's energy/physical, Regeneration's rate...
  const text = `${found.lead} ${rest} ${pieces.slice(1).join(' ')}`;
  if (!out.option && def?.options?.length) {
    const byText = def.options.find((o) => new RegExp(`\\b${o.display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
    const bySense = sense && def.options.find((o) => o.xmlId === SENSE_OPTIONS[sense[1].toLowerCase()]);
    out.option = (byText ?? bySense)?.xmlId;
    if (!out.option && found.xmlId === 'DETECT') out.option = /large class/i.test(text) ? 'LARGECLASS' : /\bclass\b/i.test(text) ? 'CLASS' : 'SINGLE';
  }

  // What's left of the phrase: the power's adders, or its input ("Detect Magic", "Absorption vs Energy")
  let leftover = [rest.replace(/^[,:;\-\s]+|[,;\s]+$/g, ''), ...pieces.slice(1)].filter(Boolean);
  const optionDisplay = out.option && def?.options?.find((o) => o.xmlId === out.option)?.display;
  if (optionDisplay) {
    // "A Class Of Things (Magic)": the option, then the input
    leftover = leftover.map((piece) => {
      const at = piece.toLowerCase().indexOf(optionDisplay.toLowerCase());
      if (at < 0) return piece;
      const after = piece.slice(at + optionDisplay.length).trim();
      const paren = /^\(([^()]*)\)\s*(.*)$/.exec(after);
      if (paren && !out.input) out.input = paren[1].trim();
      return [piece.slice(0, at), paren ? paren[2] : after].join(' ').replace(/^[,:;\-\s]+|[,;\s]+$/g, '').trim();
    }).filter(Boolean);
  }
  if (out.sense) leftover = leftover.map((piece) => piece.replace(SENSE, '').replace(/^[\s(),:;-]+|[\s(),:;-]+$/g, '').trim()).filter(Boolean);
  // "Simplified Healing 1½d6 (BODY or STUN)": hero6e heals BODY and STUN together when the input is SIMPLIFIED
  if (found.xmlId === 'HEALING' && /^simplified\b/i.test(head)) {
    out.input = 'SIMPLIFIED';
    leftover = leftover.filter((piece) => !SIMPLIFIED_TARGETS.test(piece));
  }
  const FILLER = /^(?:per|of|to|the|a|an|and|with|for|in|on|at|vs\.?|radius|rad|area)$/i;
  for (const piece of leftover.filter((p) => p.split(/[\s(),;:]+/).some((w) => w && !FILLER.test(w)))) {
    const adder = def && (leveledAdder(piece) ?? matchPowerAdder(def, piece));
    if (adder) out.adders.push(adder);
    else if (!out.input && INPUT_FIRST.has(found.xmlId)) out.input = piece.replace(/^[(\s]+|[)\s]+$/g, '');
    else if (out.input && /^\(.*\)$/.test(piece)) out.input = `${out.input} ${piece}`;
    else out.extra.push(piece);
  }
  return out;
}

const MOVEMENT_INPUT = /^(?:x\d+\s+)?noncombat/i;
const SIMPLIFIED_TARGETS = /^\(?\s*(?:body|stun)\s*(?:or|and|&|\/|,)\s*(?:body|stun)\s*\)?$/i;
/** Powers whose first unrecognized words say what they work on ("Detect Magic", "Drain STR") */
const INPUT_FIRST = new Set(['DETECT', 'AID', 'DRAIN', 'HEALING', 'DISPEL', 'ABSORPTION', 'TRANSFORM', 'SUMMON', 'CHANGEENVIRONMENT', 'MINDCONTROL', 'TELEPATHY']);

/**
 * A power's build text → a Hero Workshop power draft, its costs, and review notes.
 *
 * spec: { name, build, activeCost?, realCost?, notes?, input?, magicSkill?, skillRoll? }
 * (activeCost/realCost are the sheet's figures, used to check the build and to price power
 * details Hero Designer has no adder for)
 */
export function buildPowerDraft(character, section, spec) {
  const review = [];
  const text = normalizeBuild(spec.build ?? spec.name);
  const pieces = splitTop(text);
  const powerPieces = [];
  const mods = [];
  const unread = [];
  for (const piece of pieces) {
    if (/^\(?\d+\s+Active Points?\)?$/i.test(piece) || /^Total cost/i.test(piece)) continue;
    // "Blast 6d6 (30 Active Points)": a trailing figure isn't part of the power
    const cleaned = piece.replace(/\s*\(\d+\s+Active Points?\)\s*$/i, '');
    const m = mods.length || powerPieces.length ? parseModifierPiece(cleaned) : undefined;
    if (m) mods.push(m);
    else if (!mods.length) powerPieces.push(cleaned);
    else unread.push(cleaned);
  }

  const read = spec.custom ? undefined : readPower(powerPieces);
  let draft = hw.powerDraft(character, section, undefined, 'power');
  const def = read ? hw.getPowerDefinition(read.xmlId) : undefined;
  if (read && def) {
    draft = hw.selectPower(draft, read.xmlId);
    // No quantity in the text: powers bought by option (Detect) have none; others take their minimum
    draft.levels = read.levels || (def.lvlCost && !def.options?.length && !read.levelsInAdders ? Math.max(def.minVal ?? 1, 1) : 0);
    if (read.option) draft.option = read.option;
    draft.adders = [...read.adders];
    if (read.barrier) draft.barrier = { ...draft.barrier, ...read.barrier };
    // Attacks name the defense they're against ("Vs."); the input holds it
    let input = spec.input ?? read.input;
    if (def.inputLabel === 'Vs.' && !/^(PD|ED)$/i.test(input ?? '')) {
      input = spec.defense ?? hw.ATTACK_DEFENSE_DEFAULTS?.[read.xmlId] ?? 'PD';
      if (!spec.defense && !spec.input) review.push(`defense ${input} (default; set "defense" if it's ED)`);
    }
    if (!input && read.extra.length && def.inputLabel) input = read.extra.shift();
    draft.input = input ?? '';
    for (const piece of read.extra) if (!MOVEMENT_INPUT.test(piece)) unread.push(piece);
  } else {
    if (!spec.custom) review.push(`power "${powerPieces.join(', ').slice(0, 60)}" not recognized: custom power`);
    draft.xmlId = 'CUSTOM';
    draft.alias = powerPieces.join(', ') || spec.name;
  }
  draft.name = spec.name ?? '';
  draft.notes = spec.notes ?? '';

  const context = { powerXmlId: read?.xmlId, magicSkill: spec.magicSkill, skillRoll: spec.skillRoll };
  for (const m of mods) {
    const built = buildModifier(m, context);
    if (built.review) review.push(built.review);
    draft.modifiers.push(built.modifier);
  }
  for (const piece of unread) review.push(`couldn't read "${piece}"`);

  // The sheet's Active Points: price what the text adds that Hero Designer has no adder for
  const advantages = draft.modifiers.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0);
  let costs = hw.powerCosts(draft);
  if (draft.xmlId === 'CUSTOM') {
    const base = spec.activeCost !== undefined ? spec.activeCost / (1 + advantages) : ((spec.realCost ?? 0) * (1 + limitationTotal(draft))) / (1 + advantages);
    draft.customCost = Math.round(base * 4) / 4;
    costs = hw.powerCosts(draft);
  } else if (spec.activeCost !== undefined && Math.abs(costs.active - spec.activeCost) >= 1) {
    const builtBase = costs.base;
    const wantedBase = spec.activeCost / (1 + advantages);
    // The smallest whole (else quarter) difference that gives the sheet's Active Points
    const gives = (d) => hw.heroRoundCost((builtBase + d) * (1 + advantages)) === spec.activeCost;
    const near = Math.round(wantedBase - builtBase);
    const diff = [near, near - 1, near + 1].find(gives) ?? Math.round((wantedBase - builtBase) * 4) / 4;
    if (Math.abs(diff) >= 0.5) {
      const label = (unread.join(', ') || read?.extra?.join(', ') || 'details priced from the sheet').slice(0, 120);
      draft.adders.push(modAdder('ADDER', diff, label, { includeInBase: true }));
      review.push(`base ${builtBase} vs the sheet's ${Math.round(wantedBase * 100) / 100}: balanced with an adder (${diff > 0 ? '+' : ''}${diff}) "${label.slice(0, 50)}"`);
      costs = hw.powerCosts(draft);
    }
  }
  // Only a Real Cost on the sheet: price the power from it (Active = Real x (1 + limitations))
  if (spec.activeCost === undefined && spec.realCost !== undefined && draft.xmlId !== 'CUSTOM' && Math.abs(costs.real - spec.realCost) >= 1 && spec.realCost > 0) {
    const limits = limitationTotal(draft);
    const wantedBase = (spec.realCost * (1 + limits)) / (1 + advantages);
    const gives = (d) => hw.heroRoundCost(hw.heroRoundCost((costs.base + d) * (1 + advantages)) / (1 + limits)) === spec.realCost;
    const near = Math.round(wantedBase - costs.base);
    const diff = [near, near - 1, near + 1, near - 2, near + 2].find(gives) ?? near;
    if (diff) {
      const label = (unread.join(', ') || read?.extra?.join(', ') || 'details priced from the sheet').slice(0, 120);
      draft.adders.push(modAdder('ADDER', diff, label, { includeInBase: true }));
      review.push(`real cost ${costs.real} vs the sheet's ${spec.realCost}: balanced with an adder (${diff > 0 ? '+' : ''}${diff}) "${label.slice(0, 50)}"`);
      costs = hw.powerCosts(draft);
    }
  }
  // Active Points match but the Real Cost is lower: the sheet counts limitations it doesn't list
  if (spec.activeCost !== undefined && spec.realCost !== undefined && spec.realCost > 0 && costs.real - spec.realCost >= 1 && Math.abs(costs.active - spec.activeCost) < 1) {
    const listed = limitationTotal(draft);
    const missing = Math.round((costs.active / spec.realCost - 1 - listed) * 4) / 4;
    const fits = (v) => hw.heroRoundCost(costs.active / (1 + listed + v)) === spec.realCost;
    const value = [missing, missing - 0.25, missing + 0.25].find((v) => v > 0 && fits(v)) ?? missing;
    if (value > 0) {
      draft.modifiers.push(modifier(undefined, -value, { name: 'Limitations not itemized on the sheet', alias: 'Limitations not itemized on the sheet' }));
      review.push(`real cost ${costs.real} vs the sheet's ${spec.realCost}: the sheet counts -${value} more in limitations than it lists (added as a custom limitation)`);
      costs = hw.powerCosts(draft);
    }
  }
  if (spec.realCost !== undefined && Math.abs(costs.real - spec.realCost) >= 1) {
    review.push(`real cost ${costs.real} vs the sheet's ${spec.realCost}`);
  }
  return { draft, costs, review, xmlId: read?.xmlId };
}

const limitationTotal = (draft) => draft.modifiers.filter((m) => m.value < 0).reduce((s, m) => s + Math.abs(m.value), 0);

/**
 * Points each Requires A Roll at the character's skill it names (setting the roll's category
 * from the skill: a PS needs a PS roll). Returns review notes for skills that don't exist.
 */
export function bindSkillRolls(draft, character) {
  const review = [];
  const choices = hw.rollSkillChoices(character);
  for (const m of [...draft.modifiers]) {
    if (!m.bindSkill) continue;
    const wanted = norm(m.bindSkill);
    const skill = choices.find((s) => norm(s.value) === wanted) ?? choices.find((s) => norm(s.input) === wanted) ?? choices.find((s) => norm(s.value).includes(wanted) || wanted.includes(norm(s.value)));
    if (skill) {
      draft = hw.setRequiredSkill(draft, m.id, skill.value, character);
      // Keep the sheet's value: Hero Designer's option prices may differ from the sheet's
      draft = { ...draft, modifiers: draft.modifiers.map((x) => (x.id === m.id ? { ...x, value: m.value, isAdvantage: m.value > 0, isLimitation: m.value < 0 } : x)) };
    } else {
      review.push(`Requires A Roll names "${m.bindSkill}", which isn't one of the character's skills`);
    }
    draft = { ...draft, modifiers: draft.modifiers.map((x) => (x.id === m.id ? stripBind(x) : x)) };
  }
  return { draft, review };
}

const stripBind = ({ bindSkill, ...m }) => m;
