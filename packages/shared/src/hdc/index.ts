/**
 * Lossless HDC reading and writing.
 */

export { XmlDocument, XmlElement, XmlText, XmlParseError, parseXml, createElement } from './xml.js';
export { decodeHdcBytes, encodeHdcUtf16, detectHdcEncoding, type HdcEncoding } from './encoding.js';
export { HdcDocument, HDC_SECTIONS, HDC_ITEM_SECTIONS, ICON_ATTR, getIcon, setIcon, type HdcSection, type HdcItemSection } from './document.js';
export { parseHdcFile, parseHdcDocument, contactRollFor } from './parse.js';
export {
  extractItems,
  insertItems,
  insertParts,
  partsTarget,
  type ItemTransfer,
  type InsertOptions,
  type PartsTarget,
} from './transfer.js';
export { repairForFoundry, type RepairResult } from './repair.js';
export {
  updateHdc,
  createHdc,
  blankHdc,
  CHARACTER_TEMPLATES,
  type CharacterTemplateId,
  applyCharacterChanges,
  lookupSkillCatalog,
  type HdcWriteReport,
  type HdcWriteOptions,
} from './write.js';
export {
  validateForFoundry,
  normalizeForFoundry,
  rebindRequiresARoll,
  skillRollCategory,
  skillItemName,
  BACKGROUND_SKILL_XMLIDS,
  LABELLED_SKILL_XMLIDS,
  REQUIRED_COMPLICATION_ADDERS,
  ATTACK_DEFENSE_DEFAULTS,
  type FoundryValidationIssue,
} from './foundry.js';
export { SKILL_CATALOG_6E, SKILL_ENHANCER_CATALOG_6E, type SkillCatalogEntry } from '../generated/skillCatalog6e.js';
export { PERK_CATALOG_6E, TALENT_CATALOG_6E, DISADVANTAGE_CATALOG_6E, type CatalogEntry } from '../generated/catalog6e.js';
