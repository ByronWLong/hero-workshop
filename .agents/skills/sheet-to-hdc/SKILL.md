---
name: sheet-to-hdc
description: Construct and iterate Hero Designer-compatible .hdc files from arbitrary spreadsheet, cell-grid, or Hero Designer HTML export evidence for HERO System characters. Use when an agent needs to semantically analyze Excel/CSV/sheet data, infer HERO System characteristics, skills, powers, complications, equipment, modifiers, adders, and point costs, produce or validate a desktop Hero Designer .hdc XML file, or compare a regenerated Hero Designer HTML export against the source IR to tune missing items.
---

# Sheet to HDC

## Overview

Convert an arbitrary HERO System character sheet into a compatible Hero Designer `.hdc` file by combining semantic extraction with deterministic HDC construction tools. Assume the sheet layout is not reliable: cells must be interpreted by meaning, proximity, labels, formulas, section structure, and HERO rules context.

## Workflow

1. Inspect the source sheet into a cell grid.
2. Semantically map cells into the normalized character IR.
3. Refine the IR for Hero Designer category and cost compatibility.
4. Resolve HERO Designer XML IDs, levels, adders, modifiers, and costs.
5. Build `.hdc` XML from the IR.
6. Validate the XML and inspect warnings before handoff.
7. If the user provides a Hero Designer HTML export, compare it against the IR and tune missing item fallbacks before regenerating.

## Tools

- Use `scripts/extract-workbook-grid.ps1` to convert `.xlsx` or `.xlsm` sheets into JSON cell grids without needing Excel.
- Use `scripts/refine-ir-for-hdc.mjs` after semantic extraction to reclassify obvious perks/talents, preserve sheet real costs for custom powers, and avoid Hero Designer point inflation.
- Use `scripts/build-hdc-from-ir.mjs` to turn a normalized semantic IR JSON file into `.hdc` XML.
- Use `scripts/validate-hdc.mjs` to check XML well-formedness, required sections, core characteristics, and common compatibility risks.
- Use `scripts/compare-hero-designer-export.mjs` to compare a regenerated Hero Designer HTML export with the source IR and find dropped items.

## References

- Read `references/semantic-mapping.md` before interpreting a new sheet.
- Read `references/hdc-format.md` before constructing or debugging `.hdc` XML.
- Use `references/character-ir.schema.json` as the contract between semantic analysis and `build-hdc-from-ir.mjs`.
- For exact power and modifier XML IDs in this repo, consult `packages/shared/src/powerDefinitions.ts` and `packages/shared/src/modifierDefinitions.ts`.

## Conversion Commands

From the workspace root:

```powershell
powershell -ExecutionPolicy Bypass -File .codex\skills\sheet-to-hdc\scripts\extract-workbook-grid.ps1 -InputPath ".\character.xlsx" -OutputPath ".\sheet-grid.json"
node .codex\skills\sheet-to-hdc\scripts\refine-ir-for-hdc.mjs .\character-ir.json .\character.refined.ir.json .\sheet-grid.json
node .codex\skills\sheet-to-hdc\scripts\build-hdc-from-ir.mjs .\character.refined.ir.json .\character.hdc
node .codex\skills\sheet-to-hdc\scripts\validate-hdc.mjs .\character.hdc
node .codex\skills\sheet-to-hdc\scripts\compare-hero-designer-export.mjs .\character.refined.ir.json .\character.html .\hd-export-compare.json
```

If the runtime cannot execute PowerShell or Node directly, invoke equivalent local commands that run the same scripts in the same order.

## Semantic Rules

- Treat sheet totals, formulas, labels, and nearby annotations as evidence, not as source-of-truth fields.
- Preserve uncertain interpretations in IR `warnings` and item `notes`; do not silently discard ambiguous data.
- Prefer canonical Hero Designer XML IDs when confidence is high. Use `GENERIC` only when preserving text is safer than guessing.
- Before building, run the refinement pass when a sheet-grid is available; it corrects common sheet-derived category drift such as Contacts, Favors, Reputation, base contributions, and Danger Sense.
- For uncertain sheet-derived powers and skills, prefer Hero Designer custom objects (`CUSTOMPOWER`, `CUSTOMSKILL`) over invented XML IDs so the item survives Hero Designer import/export.
- For `CUSTOMPOWER`, preserve the sheet's real/visible cost in `BASECOST` and keep `LEVELS` at `0` unless the item explicitly requires custom levels. Do not use active cost as character cost.
- Default the root `CHARACTER` template to `builtIn.Heroic6E.hdt` unless the source IR explicitly requests another template. For fantasy/heroic sheets, default `CHARACTER_INFO.GENRE` to `Fantasy Hero` rather than a generic Champions label.
- Use `LIST` containers aggressively when the source sheet has visual power clusters such as racial abilities, acquired powers, tribunal powers, spell lists, or grouped equipment.
- When equipment text can be partially resolved, prefer `COMPOUNDPOWER` with real child stats/powers plus a fallback custom child for any remaining narrative effect text.
- Keep the original display text in `name`, `alias`, `input`, or `notes` even when normalized XML IDs are resolved.
- Recalculate deterministic values in the builder when possible, but preserve explicit point totals from the sheet in notes if they disagree.
- When the sheet marks an item as free or discounted, such as `[1pt free]`, preserve the underlying item cost/mechanics and emit the free portion as a negative generic adder instead of erasing the item's actual definition.
- Validate every generated `.hdc`; fix high-confidence structural issues before reporting completion.

## Output Standard

Return the generated `.hdc`, the IR file if useful for auditability, and validation warnings. If a sheet field cannot be mapped with confidence, make the generated file loadable and document the ambiguity rather than fabricating exact HERO mechanics. Prefer instructions and outputs that are portable across agent runtimes rather than assuming a Codex-specific interface.
