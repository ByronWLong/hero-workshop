# Hero Designer HDC Format

Use this reference when constructing or debugging `.hdc` XML for Hero Designer compatibility.

## Root Shape

Hero Designer character files are XML. This skill emits:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CHARACTER version="6.0">
  <BASIC_CONFIGURATION .../>
  <CHARACTER_INFO ...>...</CHARACTER_INFO>
  <CHARACTERISTICS>...</CHARACTERISTICS>
  <SKILLS>...</SKILLS>
  <PERKS>...</PERKS>
  <TALENTS>...</TALENTS>
  <MARTIALARTS>...</MARTIALARTS>
  <POWERS>...</POWERS>
  <DISADVANTAGES>...</DISADVANTAGES>
  <EQUIPMENT>...</EQUIPMENT>
  <RULES .../>
</CHARACTER>
```

The local app parser also accepts `HERO` roots, but `CHARACTER` is the preferred output root.

## Attribute Conventions

- Object IDs are opaque strings. Stable generated IDs are acceptable.
- Hero Designer object type IDs use `XMLID`, usually uppercase tokens.
- Use Hero Designer's custom fallback IDs when exact mechanics are uncertain: `CUSTOMSKILL` for skills, `CUSTOMPOWER` for powers/equipment, and `GENERIC_OBJECT` for lists, generic adders, and generic modifiers.
- Use `NAME` for display name/prefix and `ALIAS` for the Hero Designer display alias or rules label.
- Use `INPUT` for user-entered item detail, such as a KS subject, contact name, hunted group, or complication detail.
- Use `POSITION` to preserve display order.
- Use `LEVELS`, `BASECOST`, `LVLCOST`, `OPTION`, `OPTION_ALIAS`, `PARENTID`, `NOTES`, `ROLL`, and booleans like `FAMILIARITY="Yes"`.
- Booleans should be `Yes` or `No` for compatibility.

## Basic Configuration

`BASIC_CONFIGURATION` stores:

- `BASE_POINTS`
- `DISAD_POINTS`
- `EXPERIENCE`
- `EXPORT_TEMPLATE`

`RULES` commonly stores:

- `name`
- `BASEPOINTS`
- `DISADPOINTS`
- `APPEREND`
- `STRAPPEREND`
- rule booleans like `STANDARDEFFECTALLOWED`, `EQUIPMENTALLOWED`, and skill roll settings.

## Character Info

`CHARACTER_INFO` stores short facts as attributes:

- `CHARACTER_NAME`
- `ALTERNATE_IDENTITIES`
- `PLAYER_NAME`
- `HEIGHT`
- `WEIGHT`
- `HAIR_COLOR`
- `EYE_COLOR`
- `CAMPAIGN_NAME`
- `GENRE`
- `GM`

Height is stored in inches. Weight is stored in pounds. Longer text fields are child elements: `BACKGROUND`, `PERSONALITY`, `QUOTE`, `TACTICS`, `CAMPAIGN_USE`, `APPEARANCE`, `NOTES1` through `NOTES5`.

## Characteristics

`CHARACTERISTICS` contains one element per characteristic using the characteristic abbreviation as the tag:

```xml
<STR ID="..." NAME="STR" ALIAS="" POSITION="0" LEVELS="20" BASECOST="20" BASE="10" TOTAL="30" AFFECTS_PRIMARY="Yes" AFFECTS_TOTAL="Yes"/>
```

6E base values:

- STR, DEX, CON, INT, EGO, PRE: 10
- OCV, DCV, OMCV, DMCV: 3
- SPD: 2
- PD, ED: 2
- REC: 4
- END: 20
- BODY: 10
- STUN: 20
- RUNNING: 12
- SWIMMING: 4
- LEAPING: 4

6E cost per level:

- STR, CON, INT, EGO, PRE, PD, ED, REC, BODY, RUNNING, SWIMMING, LEAPING: 1
- DEX: 2
- OCV, DCV: 5
- OMCV, DMCV: 3
- SPD: 10
- END: 0.2
- STUN: 0.5

Negative levels should not refund points.

## Lists and Sections

Each major section has its own item tag:

- `SKILLS`: `SKILL`, `LIST`, and skill enhancer tags such as `SCHOLAR`
- `PERKS`: `PERK`, `LIST`
- `TALENTS`: `TALENT`, `LIST`
- `MARTIALARTS`: `MANEUVER`, `WEAPON_ELEMENT`, `LIST`
- `POWERS`: `POWER`, `LIST`
- `DISADVANTAGES`: `DISAD`
- `EQUIPMENT`: `POWER`

Use `LIST` with an `ID` as a visual/container parent. Child objects point at it with `PARENTID`.

## Powers

Normal powers use:

```xml
<POWER ID="..." XMLID="BLAST" NAME="Lightning Bolt" ALIAS="Blast 12d6" POSITION="0" LEVELS="12" BASECOST="0" LVLCOST="5">
  <MODIFIER XMLID="ARMORPIERCING" ALIAS="Armor Piercing" BASECOST="0.25"/>
  <MODIFIER XMLID="OAF" ALIAS="Obvious Accessible Focus" BASECOST="-1" ISLIMITATION="Yes"/>
</POWER>
```

For most powers, true base cost is `BASECOST + LEVELS * LVLCOST + adder costs`, then advantages and limitations affect active and real costs. Characteristic powers use `XMLID` equal to the characteristic abbreviation.

Use exact IDs from `packages/shared/src/powerDefinitions.ts` only when the required Hero Designer fields are known. For sheet-derived powers with uncertain adders/modifiers/options, emit `CUSTOMPOWER` and preserve the rules text in `ALIAS` or `NOTES`; invented exact XML IDs often import silently but disappear from Hero Designer HTML export.

Custom powers should include generic save attributes such as `MULTIPLIER="1.0"`, `GRAPHIC="Burst"`, `COLOR="255 255 255"`, `SFX="Default"`, `SHOW_ACTIVE_COST="Yes"`, `INCLUDE_NOTES_IN_PRINTOUT="Yes"`, `QUANTITY="1"`, `AFFECTS_PRIMARY`, `AFFECTS_TOTAL`, `DOESBODY`, `DOESDAMAGE`, `DOESKNOCKBACK`, `KILLING`, `DEFENSE`, `END`, `VISIBLE`, `RANGE`, `DURATION`, `TARGET`, `ENDCOLUMNOUTPUT`, and `USECUSTOMENDCOLUMN`.

For `CUSTOMPOWER` fallbacks from sheet rows, set `BASECOST` to the sheet-visible real cost and leave `LEVELS="0"` unless the source explicitly encodes custom levels. Preserve active/base cost, advantages, and limitations in `NOTES` until they can be represented as canonical power/modifier fields.

## Perks and Talents

Use `PERK` and `TALENT` sections rather than flattening these into `POWERS`.

- Contacts use `XMLID="CONTACT"` with cost in `LEVELS` and `BASECOST="0"`.
- Reputation can use `XMLID="REPUTATION"` or `POSITIVE_REPUTATION`; when exact adders are unknown, place the sheet point value in `BASECOST` and keep the audience/roll text in `NOTES`.
- Vehicle/base contributions use `XMLID="VEHICLE_BASE"`; if only the character-point contribution is known, set `BASEPOINTS` to five times the contribution and `BASECOST="0"`.
- Favors use `XMLID="FAVOR"` with the sheet point value in `BASECOST`.
- Exact talents such as `DANGER_SENSE` use the sheet point value in `BASECOST` with `LEVELS="0"` unless the talent definition requires levels; uncertain talents use `CUSTOMTALENT`.

## Skills

Known skills can use canonical XML IDs such as `LOCKPICKING`, `CONVERSATION`, `PERSUASION`, `STEALTH`, `INVENTOR`, `KNOWLEDGE_SKILL`, `AREA_KNOWLEDGE`, `PROFESSIONAL_SKILL`, `SCIENCE_SKILL`, `LANGUAGES`, `COMBAT_LEVELS`, `SKILL_LEVELS`, `WEAPON_FAMILIARITY`, and `SYSTEMS_OPERATION`.

When a sheet uses known prefixes, prefer canonical skill encoding over a custom fallback:

- `KS: Arcana` → `XMLID="KNOWLEDGE_SKILL"`, `ALIAS="KS"`, `INPUT="Arcana"`
- `AK: City of Anarch` → `XMLID="AREA_KNOWLEDGE"`, `ALIAS="AK"`, `INPUT="City of Anarch"`
- `PS: Stone Mason` → `XMLID="PROFESSIONAL_SKILL"`, `ALIAS="PS"`, `INPUT="Stone Mason"`
- `Systems Operation - Bandapa Intel Net` → `XMLID="SYSTEMS_OPERATION"`, `ALIAS="Systems Operation"`, `INPUT="Bandapa Intel Net"`

Use `CUSTOMSKILL` for uncertain sheet-derived skills rather than inventing IDs like `TORTURE` or `INVENTOR_SPELL_RESEARCH`. Custom skills support `ROLL` and display reliably when paired with normal skill save attributes (`CHARACTERISTIC`, `FAMILIARITY`, `PROFICIENCY`, `LEVELSONLY`, and generic save attributes).

## Modifiers and Adders

Modifiers are child `MODIFIER` elements:

- `XMLID`: canonical modifier type
- `ALIAS`: display label
- `BASECOST`: fractional value, positive for advantages and negative for limitations
- `ISLIMITATION`: `Yes` when the modifier is a limitation even if other fields are ambiguous
- `LEVELS`, `OPTION`, `OPTIONID`, `OPTION_ALIAS`, `INPUT`, `NOTES`

Adders are child `ADDER` elements:

- `XMLID`
- `ALIAS` or `NAME`
- `BASECOST`
- `LEVELS`
- `LVLCOST`
- `LVLVAL`
- `OPTION_ALIAS`
- `SELECTED`
- `INCLUDEINBASE`

## Disadvantages and Complications

Hero Designer uses `DISAD`, not `DISADVANTAGE`.

Common `XMLID` values include:

- `HUNTED`
- `PSYCHOLOGICALLIMITATION`
- `PHYSICALLIMITATION`
- `SOCIALLIMITATION`
- `SUSCEPTIBILITY`
- `VULNERABILITY`
- `DEPENDENCE`
- `DISTINCTIVEFEATURES`
- `ENRAGED`
- `DNPC`
- `RIVALRY`
- `REPUTATION`
- `UNLUCK`
- `ACCIDENTALCHANGE`

Complication points usually come from `BASECOST` plus adder costs. Store the human detail in `INPUT` or `NAME`.

Avoid invented or near-miss complication IDs. In sample Hero Designer save files, Distinctive Features uses `DISTINCTIVEFEATURES` and Rivalry uses `RIVALRY`; near misses can import but disappear from HTML export.

## Martial Arts

Custom maneuvers use `MANEUVER XMLID="MANEUVER"` with `CUSTOM="Yes"`. Hero Designer's HTML export displays the maneuver alias, so preserve the sheet-facing maneuver name in `ALIAS` and put action labels such as `grab`, `dodge`, or `strike` into `EFFECT` or `NOTES`.

## Compatibility Checklist

- Root is `CHARACTER version="6.0"`.
- Required sections exist even when empty.
- All core characteristics exist with valid totals and levels.
- Every mechanical item has an `ID` and `POSITION`.
- Powers, skills, perks, talents, equipment, and complications preserve original display text.
- Known objects use canonical `XMLID`; uncertain powers/skills use `CUSTOMPOWER` or `CUSTOMSKILL`, and generic perks/modifiers/lists use `GENERIC` or `GENERIC_OBJECT` with notes.
- Generated XML is well formed and validates with `scripts/validate-hdc.mjs`.
