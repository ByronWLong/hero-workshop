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
- Use `LEVELS`, `BASECOST`, `OPTION`, `OPTION_ALIAS`, `PARENTID`, `NOTES`, `ROLL`, and booleans like `FAMILIARITY="Yes"`. Use `LVLCOST` only on child adders/modifiers that require it; current Foundry HERO 6e item models reject it on every power/equipment item.
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
- `PERKS`: `PERK`, `LIST`, and perk-enhancer tags such as `WELL_CONNECTED`
- `TALENTS`: `TALENT`, `LIST`
- `MARTIALARTS`: `MANEUVER`, `WEAPON_ELEMENT`, `LIST`
- `POWERS`: `POWER`, `LIST`, and characteristic tags such as `SPD`, `DCV`, or `RUNNING` for characteristic-adjustment powers
- `DISADVANTAGES`: `DISAD`
- `EQUIPMENT`: `POWER`

Use `LIST` with an `ID` as a visual/container parent. Child objects point at it with `PARENTID`.

## Powers

Normal powers use:

```xml
<POWER ID="..." XMLID="ENERGYBLAST" NAME="Lightning Bolt" ALIAS="Blast" INPUT="ED" POSITION="0" LEVELS="12" BASECOST="0">
  <MODIFIER XMLID="ARMORPIERCING" ALIAS="Armor Piercing" BASECOST="0.25"/>
  <MODIFIER XMLID="FOCUS" ALIAS="Obvious Accessible Focus" BASECOST="-1" OPTIONID="OAF" OPTION_ALIAS="Obvious Accessible Focus (OAF)"/>
</POWER>
```

For most powers, true base cost is `BASECOST + LEVELS * template level cost + adder costs`, then advantages and limitations affect active and real costs. Do not serialize the template level cost as a top-level `LVLCOST`: Hero Designer resolves it from the power `XMLID`, while current Foundry HERO 6e item models reject that extra property on both powers and equipment. Characteristic-adjustment powers use the characteristic abbreviation as both the element tag and `XMLID`, for example `<SPD XMLID="SPD" ...>`. Encoding one as `<POWER XMLID="SPD">` can load without a blocking error but be omitted from Hero Designer exports.

For attacks, set `INPUT` to the defense Foundry should use (`PD`, `ED`, or `MD`). `DEFENSE="NORMAL"` is not sufficient for Foundry's attack-defense resolver. Typical defaults are `ED` for `ENERGYBLAST` and `PD` for `RKA`, `HKA`, `HANDTOHANDATTACK`, and `TELEKINESIS`.

Transform grades are `OPTIONID` values on `XMLID="TRANSFORM"`: `COSMETIC` costs 3 per d6, `MINOR` 5, `MAJOR` 10, and `SEVERE` 15. A purchased `+Xm Running` is a `RUNNING` characteristic-adjustment power with `LEVELS="X"`; use `INCREASEDEND` with `OPTIONID="2X"` for `Increased END (x2 END; -1)`.

Use exact IDs from `packages/shared/src/powerDefinitions.ts` only when the required Hero Designer fields are known. For sheet-derived powers with uncertain adders/modifiers/options, emit `CUSTOMPOWER` and preserve the rules text in `ALIAS` or `NOTES`; invented exact XML IDs often import silently but disappear from Hero Designer HTML export.

Every power should include explicit damage flags (`DOESBODY`, `DOESDAMAGE`, `DOESKNOCKBACK`, and `KILLING`) so Foundry does not infer undefined model fields. Custom powers additionally require generic save attributes such as `MULTIPLIER="1.0"`, `GRAPHIC="Burst"`, `COLOR="255 255 255"`, `SFX="Default"`, `SHOW_ACTIVE_COST="Yes"`, `INCLUDE_NOTES_IN_PRINTOUT="Yes"`, `QUANTITY="1"`, `AFFECTS_PRIMARY`, `AFFECTS_TOTAL`, `DEFENSE`, `END`, `VISIBLE`, `RANGE`, `DURATION`, `TARGET`, `ENDCOLUMNOUTPUT`, and `USECUSTOMENDCOLUMN`.

For `CUSTOMPOWER` fallbacks from sheet rows, set `BASECOST` to the sheet-visible real cost and leave `LEVELS="0"` unless the source explicitly encodes custom levels. Preserve active/base cost, advantages, and limitations in `NOTES` until they can be represented as canonical power/modifier fields.

## Perks and Talents

Use `PERK` and `TALENT` sections rather than flattening these into `POWERS`.

- Contacts use `XMLID="CONTACT"` with cost in `LEVELS` and `BASECOST="0"`.
- `WELL_CONNECTED` is a direct `PERKS` child with `NAME=""`, `ALIAS="Well-Connected"`, `BASECOST="3"`, and `INTBASED="No"`. It is a container-like perk enhancer, not a `LIST`: qualifying `CONTACT` and `FAVOR` perks use its `ID` as their `PARENTID`.
- Positive Reputation uses `XMLID="REPUTATION"`, `BASECOST="0"`, purchased `LEVELS`, and required `HOWWIDE` and `HOWWELL` child adders. Foundry uses `HOWWELL` to derive the Reputation roll, so omitting these adders can leave the imported actor invalid.
- Vehicle/base contributions use `XMLID="VEHICLE_BASE"`; if only the character-point contribution is known, set `BASEPOINTS` to five times the contribution and `BASECOST="0"`.
- Favors use `XMLID="FAVOR"` with the sheet point value in `BASECOST`.
- Exact talents such as `DANGER_SENSE` use the sheet point value in `BASECOST` with `LEVELS="0"` unless the talent definition requires levels; uncertain talents use `CUSTOMTALENT`.

## Skills

Known skills can use canonical XML IDs such as `LOCKPICKING`, `CONVERSATION`, `PERSUASION`, `STEALTH`, `INVENTOR`, `KNOWLEDGE_SKILL`, `AREA_KNOWLEDGE`, `PROFESSIONAL_SKILL`, `SCIENCE_SKILL`, `LANGUAGES`, `COMBAT_LEVELS`, `SKILL_LEVELS`, `WEAPON_FAMILIARITY`, and `SYSTEMS_OPERATION`.

Canonical skills with a characteristic-based roll must retain that basis in `CHARACTERISTIC`; for example, emit `STEALTH` with `CHARACTERISTIC="DEX"`. Leaving it as a general skill can make Foundry unable to build its roll data.

When a sheet uses known prefixes, prefer canonical skill encoding over a custom fallback:

- `KS: Arcana` → `XMLID="KNOWLEDGE_SKILL"`, `ALIAS="KS"`, `INPUT="Arcana"`
- `AK: City of Anarch` → `XMLID="AREA_KNOWLEDGE"`, `ALIAS="AK"`, `INPUT="City of Anarch"`
- `PS: Stone Mason` → `XMLID="PROFESSIONAL_SKILL"`, `ALIAS="PS"`, `INPUT="Stone Mason"`
- `Systems Operation - Bandapa Intel Net` → `XMLID="SYSTEMS_OPERATION"`, `ALIAS="Systems Operation"`, `INPUT="Bandapa Intel Net"`

Use `CUSTOMSKILL` for uncertain sheet-derived skills rather than inventing IDs like `TORTURE` or `INVENTOR_SPELL_RESEARCH`. Custom skills support `ROLL` and display reliably when paired with normal skill save attributes (`CHARACTERISTIC`, `FAMILIARITY`, `PROFICIENCY`, `LEVELSONLY`, and generic save attributes).

For `COMBAT_LEVELS`, plain Hero Designer import works with the skill alone, but Foundry can require explicit attack binding for "single attack" CSLs. That binding can be represented with zero-cost child adders such as `ADDER XMLID="ADDER" BASECOST="0" ALIAS="Exact Attack Name"`. In this skill, prefer inferred bindings only when combat focus terms in the skill text, such as `sword`, `knife`, `bow`, `claw`, or `grab`, match one unambiguous generated attack candidate; guessed bindings are worse than leaving the CSL unbound.

## Modifiers and Adders

Modifiers are child `MODIFIER` elements:

- `XMLID`: canonical modifier type
- `ALIAS`: display label
- `BASECOST`: fractional value, positive for advantages and negative for limitations
- `LEVELS`, `OPTION`, `OPTIONID`, `OPTION_ALIAS`, `INPUT`, `COMMENTS`, `NOTES`

Use the sign of `BASECOST` to distinguish advantages from limitations. Do not serialize `ISLIMITATION`; current Foundry HERO 6e modifier models reject it as an unknown property.

`REQUIRESASKILLROLL` is a special compatibility case. Use `ALIAS="Requires A Roll"` and leave `INPUT` absent. Put Hero Designer's short skill binding label in `OPTION_ALIAS`, but put the emitted skill's `NAME` or `ALIAS` in `COMMENTS`, because Foundry matches against those identities rather than the rendered detail string. The `OPTIONID` must also match the underlying skill category: `PS` for `PROFESSIONAL_SKILL`, `KS` for Knowledge/Area/City Knowledge, `SS` for `SCIENCE_SKILL`, and `SKILL` for ordinary skills; retain `1PER5` or `1PER20` suffixes when present. For a Professional Skill emitted as `NAME="Magic Skill" INPUT="Wizardry"`, use `OPTIONID="PS"`, `OPTION_ALIAS="Wizardry"`, and `COMMENTS="Magic Skill"`; do not append `: Wizardry`. Populating `INPUT` on the modifier causes Hero Designer to warn that the skill is undefined and can cause the modifier to be stripped on save.

Do not interpret `half END to maintain` as the `REDUCEDEND` advantage. On a normally zero-END power such as an `SPD` adjustment, represent `Costs END to Activate and half END to maintain` with `COSTSEND OPTIONID="EVERYPHASE"` and `COSTSENDTOMAINTAIN OPTIONID="HALF"`. Working Hero Designer saves use `FORCEALLOW="Yes"` for both modifiers. A standalone `1/2 END` on a power that already costs END remains `REDUCEDEND OPTIONID="HALFEND"`.

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

Do not omit required option adders from roll-bearing complications. In particular, `SOCIALLIMITATION` requires `OCCUR` and `EFFECTS`; Foundry derives its roll from `OCCUR` and can fail while rendering the Disadvantages tab when that adder is absent. Other roll-bearing complications similarly require their canonical roll adders, such as `APPEARANCE` for `HUNTED`, `INTENSITY` for `PSYCHOLOGICALLIMITATION`, and `RECOGNIZED` for negative `REPUTATION`.

Avoid invented or near-miss complication IDs. In sample Hero Designer save files, Distinctive Features uses `DISTINCTIVEFEATURES` and Rivalry uses `RIVALRY`; near misses can import but disappear from HTML export.

## Martial Arts

Custom maneuvers use `MANEUVER XMLID="MANEUVER"` with `CUSTOM="Yes"`; never derive `XMLID` from the maneuver's display name. Preserve the sheet-facing maneuver name in `ALIAS`.

When the underlying maneuver type is recognizable, set `NAME` and `DISPLAY` to the canonical maneuver name such as `Dodge`, `Grab`, `Flying Grab`, or `Strike`, and keep the custom sheet name in `ALIAS`. This improves downstream compatibility for consumers that classify martial maneuvers by their base maneuver identity rather than by the custom display name.

Put extra sheet-specific action text into `EFFECT` or `NOTES`.

## Compatibility Checklist

- Root is `CHARACTER version="6.0"`.
- Required sections exist even when empty.
- All core characteristics exist with valid totals and levels.
- Every mechanical item has an `ID` and `POSITION`.
- Powers, skills, perks, talents, equipment, and complications preserve original display text.
- Known objects use canonical `XMLID`; uncertain powers/skills use `CUSTOMPOWER` or `CUSTOMSKILL`, and generic perks/modifiers/lists use `GENERIC` or `GENERIC_OBJECT` with notes.
- Generated XML is well formed and validates with `scripts/validate-hdc.mjs`.
