# Semantic Sheet Mapping

Use this reference before converting arbitrary spreadsheet cells into the character IR.

## Mapping Process

1. Extract every visible sheet into a cell grid with address, row, column, value, raw value, and formula.
2. Identify sections by labels and spatial grouping: characteristics, combat values, skills, perks, talents, powers, martial arts, complications, equipment, background, and campaign rules.
3. Normalize repeated row patterns into item arrays. Treat merged-looking labels, blank spacer rows, indentation, and nearby totals as structural evidence.
4. Map each item to HERO semantics before emitting IR. A visible label like "Claws 2d6 HKA, AP, OAF" is one power with a killing attack XML ID, effect dice, modifiers, and focus limitation.
5. Preserve source evidence in notes or warnings when a field is inferred from context.
6. Build the HDC only after the IR is internally coherent.
7. Run the HDC refinement pass before building when the sheet-grid is available; arbitrary sheets often place perks, talents, and equipment-like powers in a shared “powers” block.

## Cell Evidence Heuristics

- Prefer explicit labels over position, but use position to associate unlabeled values with nearby headings.
- Treat formulas as intent hints. A total formula near powers or skills usually identifies category totals, not an item.
- Interpret abbreviations in HERO context: OAF/OIF/IAF/IIF are Focus limitations; AP is Armor Piercing; AoE is Area Of Effect; HKA/RKA map to Killing Attack; CSL/SL map to level skills.
- If a sheet contains both base characteristic values and bought values, emit total characteristic value and keep the sheet's bought/bonus wording in notes.
- If roll numbers appear as "13-", store numeric roll `13`. If the roll is implied by a characteristic, leave it absent unless the sheet explicitly records it.
- Use the sheet's point total as a consistency check, not as proof that every row is parsed correctly.
- Distinguish active cost from real/visible sheet cost. If a row has Active/Base/Ads/Lims/Real columns, preserve the real or visible row cost as character-point cost for custom fallbacks.
- If a row explicitly says an item is free or partially free, such as `[1pt free]`, preserve the item's visible cost and carry the free portion as a separate campaign discount adjustment in the IR.
- Do not classify every use of the word "contact" as a Contact perk; require a Contact row/name or clear point notation such as `[5pt contact]`.

## IR Construction Rules

- Use camelCase field names matching `character-ir.schema.json`.
- Use 6E defaults unless the sheet clearly states another rules configuration.
- Store characteristic values as totals: `{ "STR": 30, "DEX": 23 }`. The builder converts totals to HDC levels.
- For item arrays, include at least `name`. Add `xmlId`, `alias`, `input`, `levels`, `baseCost`, `lvlCost`, `points`, `modifiers`, and `adders` when known.
- Use `sourceRefs` for traceability: cell addresses, sheet names, or compact ranges such as `Powers!A14:F14`.
- Put uncertainty in top-level `warnings` or item `notes`.

## Common Semantic Targets

- Character info: character name, player, campaign, genre, GM, height, weight, hair, eyes, background, personality, quote, tactics, appearance, notes.
- Basic configuration: base points, complication/disadvantage points, experience.
- Characteristics: STR, DEX, CON, INT, EGO, PRE, OCV, DCV, OMCV, DMCV, SPD, PD, ED, REC, END, BODY, STUN, RUNNING, SWIMMING, LEAPING.
- Skills: general skills, characteristic-based skills, background skills, combat levels, skill levels, languages, transport familiarities, weapon familiarities, skill enhancers.
- Powers: direct powers, frameworks/lists, compound powers, characteristic powers, advantages, limitations, adders, END cost, active cost, real cost.
- Perks: Contacts, Favors, Reputation, base/vehicle contributions, fringe benefits, money, followers, and computer links even when they appear in a sheet's right-side "powers" block.
- Talents: Danger Sense, Combat Luck, Eidetic Memory, Lightsleep, Universal Translator, and custom talents even when the sheet lists them beside powers.
- Complications: Hunted, Psychological, Physical, Social, Distinctive Features, Enraged, DNPC, Rivalry, Reputation, Susceptibility, Vulnerability, Dependence, Accidental Change, Unluck.
- Equipment: carried state, price, weight, contained powers, focus limitations.

## Ambiguity Policy

- Do not invent exact XML IDs for mechanics that are only described narratively. Use a generic item with preserved text if necessary.
- Do not convert a descriptive paragraph into multiple mechanical items unless the sheet structure supports that split.
- When point totals disagree, keep the loadable HDC and report the mismatch with the relevant source cells. First check whether active costs were emitted as real costs or whether perks/talents were flattened into powers.
- When edition is unclear, use HERO 6E because the repo models 6E characteristics and costs.
