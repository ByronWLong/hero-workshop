---
name: sheet-to-hdc
description: Construct and iterate Hero Designer-compatible .hdc files from arbitrary spreadsheet, cell-grid, or Hero Designer HTML export evidence for HERO System characters. Use when an agent needs to semantically analyze Excel/CSV/sheet data, infer HERO System characteristics, skills, powers, complications, equipment, modifiers, adders, and point costs, produce or validate a desktop Hero Designer .hdc XML file, or score a generated file against the sheet it came from.
---

# Sheet to HDC

## Overview

Convert an arbitrary HERO System character sheet into a Hero Designer `.hdc` that loads in Hero Designer and in Foundry (hero6e + Hero Workshop). Sheets are unreliable: read cells by meaning, proximity, labels, formulas and section structure, then write a normalized IR. The builder turns the IR into a file with **Hero Workshop's own code** (`packages/shared`): its catalogs (generated from Hero Designer's `Main6E.hdt`), its editor operations and costs, and the HDC writer the Foundry module uses. Every item's cost is then checked against the sheet.

Build the shared package first: `npm run build:shared` in the repo root.

## Workflow

1. **Grid.** Extract the workbook into a JSON cell grid (`scripts/extract-workbook-grid.ps1`).
2. **Read the sheet.** Find the point totals first (characteristics, skills, powers, base, experience, complications) and check which rows add up to them. Rows a total leaves out (costs in parentheses, rows without a cost, campaign-granted packages) are **free** items. Note sheet arithmetic that doesn't add up.
3. **Write the IR** (`references/character-ir.schema.json`, `references/semantic-mapping.md`). Powers and equipment are written as HERO build text (`"build"`), with the sheet's Active Points and Real Cost.
4. **Build:** `node scripts/build-hdc.mjs <ir.json> <out.hdc> <build-report.md> [--prefabs <dir>]`. It also writes `<out.hdc>.map.json`, linking each IR item to its HDC ID.
5. **Score:** `node scripts/score-hdc.mjs <ir.json> <out.hdc> <score.md>`. It reports each item's cost against the sheet, custom fallbacks, Foundry validation and the repairs hero6e's import would make.
6. **Iterate.** Fix the IR (or the scripts) until every difference is either fixed or explained in the IR's `warnings` (the sheet's own arithmetic, house rules). Read the build report: it lists every judgment call (custom modifiers, Limited Powers, powers priced from the sheet).
7. **Optional: validate in Foundry.** Import the `.hdc` into a throwaway hero6e actor (`actor.uploadFromXml`) and compare hero6e's item costs with the scorer's (see `references/hdc-format.md`, "Foundry").

## Tools

- `scripts/extract-workbook-grid.ps1`: `.xlsx`/`.xlsm` → JSON cell grid (address, value, formula), without Excel.
- `scripts/build-hdc.mjs`: IR → `.hdc` through Hero Workshop:
  - **Skills, perks, talents, martial arts and complications:** built through the editor's item forms. Complications get Hero Designer's required option adders, chosen to reach the sheet's points.
  - **Contacts and Positive Reputations:** get their levels and option adders.
  - **Powers and equipment:** built through the editor's power drafts, parsed from build text by `scripts/lib/hero-text.mjs`.
  - **Requires A Roll:** bound to the character's skill.
  - **Prefabs:** items with `"prefab"` are copied from a Hero Designer prefab library with fresh IDs.
  - **Import repairs:** `repairForFoundry` runs last.
- `scripts/score-hdc.mjs`: per-item costs vs the sheet (read with Hero Workshop's parser), points spent vs the sheet's total, custom fallbacks, Foundry issues.
- `scripts/lib/hero-text.mjs`: the build-text parser:
  - **Powers:** matched by Hero Designer's names, abbreviations and synonyms.
  - **Levels:** read from dice, meters, points, STR, PD/ED or "+N CHAR".
  - **Adders:** the power's own adders and sense modifiers.
  - **Modifiers:** each takes the text's value, with XMLID, option and adders from the catalog. NND becomes AVAD (Very Common → Rare) with All Or Nothing. Requires A Roll becomes a Skill roll bound to the named or magic skill; characteristic and fixed rolls are handled too. Focus covers expendability, fragility and mobility, and Charges, AoE (Hero Designer's doubling sizes) and Megascale are supported.
  - **Unknowns:** an unrecognized limitation worded as a condition ("Only…", "Not…", "Must…") becomes Limited Power. Anything else unknown becomes a custom modifier.
  - **Sheet costs:** when the sheet's figures say more than the text, the difference becomes a labelled adder or limitation, so costs match the sheet. Each such case is reported.
- Version 1 IRs (no build text): `build-hdc.mjs` still accepts their structured fields (`hdcXmlId`, `levels`, `modifiers`). `scripts/validate-hdc.mjs`, `scripts/compare-hero-designer-export.mjs` and `scripts/refresh-hdc-foundry-compatibility.ps1` remain for retained files.

## Commands

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\sheet-to-hdc\scripts\extract-workbook-grid.ps1 -InputPath ".\character.xlsx" -OutputPath ".\character.grid.json"
node .agents\skills\sheet-to-hdc\scripts\build-hdc.mjs .\character.ir.json .\character.hdc .\character.build.md --prefabs ..\fantasy-hero-compendium\sources\tons
node .agents\skills\sheet-to-hdc\scripts\score-hdc.mjs .\character.ir.json .\character.hdc .\character.score.md
```

## Semantic Rules

- **Sheet evidence:** treat totals, formulas, labels and annotations as evidence, not fields. Reconcile the sheet's totals; put every unexplained difference in `warnings`.
- **Build text:** write powers as HERO build text in book notation:
  - **Power phrase first:** "Blast 6d6, Armor Piercing (+¼)".
  - **Advantages, then limitations:** each written "Name (detail; value)", e.g. "OAF (staff; -1), Requires A Roll (Wizardry; -½)".
  - **Commas:** keep them out of modifier names; put details in the parentheses.
  - **Sheet notation:** "[+1/4]" and "-½" are accepted too.
- **Costs:** give the sheet's `activeCost` and `realCost` for every power. The builder prices what the text doesn't say from them and reports it.
- **Free items:** mark items the sheet doesn't count `"free": true` (cost multiplier 0). This covers campaign packages, racial abilities in parentheses, and points paid by others.
- **Magic:** a casting skill is a Power skill (`POWERSKILL`), not a Professional Skill. Spells' "Requires A Magic Roll" / "Skill Roll: X" become a Skill roll bound to that skill. Set the IR's `magicSkill`.
- **Skill levels:** give each skill's `points` (or `levels`). Under an enhancer (Scholar, Linguist, Scientist, Well-Connected) the builder counts the enhancer's 1-point saving.
- **Attack links:** Combat Skill Levels name the attacks they apply to (`"attacks"`: the power or equipment names); Foundry applies them only to those.
- **Prefabs:** use `"prefab"` for equipment that exists in a prefab library (e.g. the private Fantasy Hero compendium's TONS items) rather than re-deriving it.
- **Customs:** prefer Hero Designer's own powers and modifiers. A custom modifier is fine for campaign-specific ones ("Tuned for Powerstone", "Spellcaster Signature", "Independent"); use `"custom": true` for items that are only a name ("Item to be determined").
- **Templates:** default to `builtIn.Heroic6E.hdt` and Fantasy Hero for fantasy sheets.
- **Maxima:** set characteristic maxima only when the sheet's rules turn them on.

## Output Standard

Return the `.hdc`, the IR, the build report and the score. Report the cost match rate, the points spent against the sheet's total with each difference explained, custom fallbacks, and any Foundry issues. Never fabricate mechanics to make a cost match: price the difference from the sheet, label it, and say so.
