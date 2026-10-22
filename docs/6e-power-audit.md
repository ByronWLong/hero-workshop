# HERO 6e Power Audit

The power-by-power companion to [6e-modifier-audit.md](6e-modifier-audit.md). Sources:

- **6E1**: *HERO System 6th Edition, Volume 1*, Chapter Five (Powers, pp. 120–312), via the rpg-library MCP. Printed page numbers.
- **HD**: Hero Designer's power classes (`java/Hero Designer Source Code/src/com/hero/objects/powers/*.java`), its generic pricing (`GenericObject.getTotalCost`/`getActiveCost`/`getRealCostPreList`), and `template/Main6E.hdt`.
- **HD exports**: `samples/Skralk SkekMal.HTML` and `samples/Strevka SkekMal.html`, Hero Designer's own printouts of `samples/SkralkSkekMal.hdc` and `samples/Strevka Skek'Mal.hdc`, which give HD's Active Points, Real Cost and END for every power.
- **HW**: `packages/shared/src` (`powerDefinitions.ts`, `editor/powers.ts`, `hdc/parse.ts`).

## 1. Against Hero Designer's own costs

Every power in both HD exports (67 items) was compared with HW's Active Points, Real Cost and END:

| | Before | After this pass |
|---|---|---|
| Skralk (48 items) | 43 match | 45 match, plus 3 that aren't really costs (below) |
| Strevka (19 items) | 19 match | 19 match |

The three remaining "mismatches" are Custom Powers ("Tribunal Regeneration/Immunity/Immortality") that cost 0. Their "39 Active Points" is text in their names, not a cost.

Fixed in this pass (tests in `level-steps.test.ts`):

| Rule | HD | Was in HW | 6E1 / example |
|---|---|---|---|
| A part step of levels costs a whole step: 247 points of Multiform at 1 per 5 is 50 steps; 5 REC at 2 per 3 is 2 | `GenericObject.getTotalCost` | fractional steps (49.4, 3.3) | Shark Tooth (Multiform 55), Powerstone (Endurance Reserve 19) in Skralk |
| Barrier's defenses at 3 per 2 points, a part pair costing a whole one | `ForceWall.getTotalCost` | ceil(total × 1.5): 1 less on odd totals | – |
| Resistant Protection's Flash Defense adder is priced with its other defenses (one 3-per-2 count) | `ForceField.getTotalCost` | priced separately | – |
| Duplication pays for its points exactly (no whole steps) | `Duplication.getTotalCost` | (would have rounded up after the step fix) | – |
| Density Increase stops at 50 levels | `DensityIncrease.getLevels` | no cap | – |
| Detect: a Large Class of Things is 10 | template | 8 (hand-written) | – |
| Adder levels in steps keep their fraction (5 points of Flash Defense at 3 per 2 is 2½ steps, and saves back as 5) | `Adder.getTotalCost` | floored, losing a point on save | – |

## 2. Hero Workshop's definitions against the template

All 92 hand-written power definitions were compared with Main6E.hdt (costs, level steps, duration, range, target, defense, END, adders and options). They agree, apart from:

- Detect's Large Class of Things (fixed, above).
- Nightvision carries Telescopic and Increased Arc adders, and Mind Scan +½d6/+1 pip. These belong to HW's sense-scope pricing and dice handling and aren't in the template under those powers. Kept.
- Characteristics, Skill Levels, Running/Swimming/Leaping, Enhanced Senses and frameworks aren't template powers. HW defines them itself.

## 3. Against the book's Powers Table (6E1 162–164)

Duration, target, range and END for all 58 powers in the table match the template, with three exceptions:
- The template's "No" range for Self powers (Life Support, Resistant Protection...) is the same as the book's "Self" for every rule.
- Deflection, Leaping, Running and Swimming aren't template powers.
- Mind Scan appears twice in the template, the first time as an empty entry. The power rules now use the complete one (`POWER_TEMPLATE`).

## 4. Hero Designer's per-power pricing

| HD class | What it does | HW |
|---|---|---|
| CompoundPower | sums its parts | OK |
| CustomPower | its BASECOST and adders | OK |
| ChangeEnvironment | levels without step rounding; positive adders before min/max, negative after | OK (no levels in 6E) |
| Duplication | points / 5 exactly | **fixed** |
| DensityIncrease | 50-level cap | **fixed** |
| EnduranceReserve | Reserve and Recovery priced together when they have the same modifiers, else separately | separately always. Differs only when both carry the same advantages (rounding once vs twice). **Open** |
| ForceField (Resistant Protection) | PD+ED+MD+POWD (+ Flash Defense adder) at 3 per 2 | **fixed** |
| ForceWall (Barrier) | defenses as above, +1 per m length/height, +2 per width step, +1 per BODY | **fixed** (defenses); sizes already matched |
| MentalDefense / MentalAwareness | 5E-only adjustments | OK in 6E |
| MissileDeflection | With Reflection and Ranged, Ranged applies only to the Reflection part | **Open** (rare) |
| Multiform / Summon | generic | OK (after the step fix) |
| NakedModifier | a naked advantage (6E1 314–316) priced on its own | **Gap**: HW has no naked advantages |
| Sense | a sense group's built-in sense adders are free | HW's sense-scope pricing (`sense-scope.test.ts`) |
| Armor, DamageResistance | 5E powers | n/a |

## 5. Done since

- **Naked advantages** (6E1 314–316): the template's `NAKEDMODIFIER` power, priced as `NakedModifier` does (`nakedAdvantageCosts`). LEVELS is the Active Points it's for. Modifiers without `PRIVATE` are what it adds; private ones ("On the naked advantage itself" in the dialog) apply to it. Unlike HD, a private Reduced Endurance isn't doubled by the Autofire the naked advantage adds, because the book prices Renegade's Quick Shot (6E1 315) at 22. hero6e shows that example as 75: it counts the private Reduced Endurance (doubled) as part of what's added. Tests: `naked-advantage.test.ts`.
- **Chapter Five notes**: `powerBookNotes` covers what the power itself needs (names, minimums, Special Powers in frameworks), and `modifierBookNotes` gained a per-power table (Darkness can't buy a Radius area, Entangle can't take AVAD, and so on). Each note gives its 6E1 page. Tests: `power-book-notes.test.ts`.

## 6. Open

1. **Endurance Reserve** with the same advantages on Reserve and Recovery: HD rounds once.
2. **Reflection with Ranged** on Deflection: HD applies Ranged to the Reflection adders only.
3. **Custom Power rounding**: HD's export shows a 22-point Custom Power with -¾ at Real Cost 12, where 22 / 1¾ = 12.57 rounds to 13.
4. **Chapter Five rules about play**, not construction, were left out of the notes: Absorption/Aid/Healing maximums and fade, Growth/Shrinking tables, Summon control, and the like.
