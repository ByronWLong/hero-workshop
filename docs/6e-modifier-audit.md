# HERO 6e Power Modifier Audit

Audit of Hero Workshop's Power Advantages and Limitations against three sources:

- **6E1**: *HERO System 6th Edition, Volume 1*, Chapters Six (Advantages, pp. 313–362) and Seven (Limitations, pp. 364–396), read through the rpg-library MCP. Page numbers are the printed ones.
- **HD**: Hero Designer's Java source (`java/Hero Designer Source Code/src/com/hero/objects/modifiers/*.java`) and template (`template/Main6E.hdt`). HD is what writes the `.hdc` files and what hero6e mirrors, so where HD and the book disagree, HD's cost wins and the book rule becomes a warning.
- **HW**: Hero Workshop (`packages/shared/src`): `modifierDefinitions.ts`, `editor/powers.ts`, `hdc/parse.ts`, `generated/catalog6e.ts`, `scripts/generate-catalogs.mjs`.

Scope: Power Modifiers and the cost and END rules around them. Power-by-power rules from Chapter Five (for example Barrier, Absorption, Transform) are a later pass.

Status legend: **OK** matches HD · **Data** missing or wrong catalog data · **Cost** value computed differently from HD · **Rule** applicability rule HD enforces and HW does not · **Book** book rule that neither HD nor HW enforces (warning candidate).

---

## 1. Systemic gaps

These cause most of the per-modifier findings in section 2. Fixing them first fixes many rows at once.

### S1. The catalog generator drops option-scoped adders and `REQUIRES`

`generate-catalogs.mjs` reads `ADDER` children of a modifier but not `ADDER` children of an `OPTION`. The template nests these adders under options:

| Modifier | Option | Adders lost |
|---|---|---|
| AOE | RADIUS | ACCURATE (+¼) |
| AOE | CONE | THINCONE (-¼) |
| AOE | LINE | DOUBLEHEIGHT, DOUBLEWIDTH |
| AOE | ANY | FIXEDSHAPE (-¼) |
| AUTOFIRE | FIVE | DOUBLE (x2 shots, +½ per level) |
| UOO | UBO / SIMULTANEOUSLY / UNB / UAA | GRANTORTAKEBACK, TOTALCONTROL, GRANTORPAYSEND, NOSELFUSE, LIMITEDRANGE, STANDARDRANGE, REMAINWITHINLOS, REMAINCLOSE, TARGETS, ONEATATIME, ALLINRANGE (varies by option) |
| EXTRATIME | SEGMENT, TURN … 1CENTURY | NOOTHERACTIONS (-¼) |
| EXTRATIME | FULL, EXTRA | DELAYEDPHASE (-¼) |
| DARKNESS (power) | ALTEREDSHAPE.LINE | DOUBLEWIDTH |
| TRANSFORM (power) | COSMETIC … SEVERE | PLUSONEHALFDIE, PLUSONEPIP, MINUSONEPIP |

The hand-written definitions in `modifierDefinitions.ts` restore some of these (ACCURATE, THINCONE, DOUBLE, four UOO adders, NOOTHERACTIONS, DELAYEDPHASE). They do it without the option scoping, so the editor offers Accurate on a Cone and Delayed Phase on 1 Minute. The rest are missing.

The generator also never reads `<REQUIRES>` (for example, UOO's TOTALCONTROL requires GRANTORPAYSEND).

**Fix:** emit `options[].adders` (and `requires`) in the catalog. Have the editor show an option's adders only while that option is selected. Then drop the hand-written copies.

### S2. Sub-modifiers of modifiers are not supported

Six template modifiers carry their own modifiers. HD prices the parent as `value × (1 + sub-advantages) / (1 + sub-limitations)`, rounded to ¼ (`Modifier.getTotalValue`).

| Parent | Sub-modifier | Effect | 6E1 |
|---|---|---|---|
| EXTRATIME | ACTIVATEONLY (-1) | halves the value (min -¼) | 375 |
| CONCENTRATION | CONTINUOUSCONCENTRATION (+1) | doubles ("throughout") | 373 |
| GESTURES | THROUGHOUT (+1) | doubles | 381 |
| INCANTATIONS | CONSTANT (+1) | doubles | 382 |
| SIDEEFFECTS | ALWAYSOCCURS (+1) | doubles | 395 |
| DAMAGEOVERTIME | ONEDEFENSE, LOCKOUT | doubles the increments value / doubles or zeroes the time value | 330 |

HW's `parseModifiers` reads only a power's own `MODIFIER` children, so a sub-modifier never affects a value. `modifierDefinitions.ts` models THROUGHOUT and CONSTANT as **adders** (baseCost +1). The adder sum (-¼ + 1) is then clamped to -¼, so "throughout" costs nothing in HW. HD and hero6e would also not read these as sub-modifiers.

**Evidence** (`samples/SkralkSkekMal.hdc` against HD's own export `samples/Skralk SkekMal.HTML`): *Penetrating … superheat blade*. HD shows Extra Time (1 Turn, Only to Activate, -¾), Real Cost 12. HW computes Extra Time -1¼, Real Cost 10. Five sample files use these sub-modifiers.

HD also hides some sub-modifiers depending on the power: THROUGHOUT, CONSTANT and CONTINUOUSCONCENTRATION are removed for Instant powers unless they have Extra Time or are Mind Control, Mind Scan, Mind Link, Telepathy or Barrier.

### S3. Hand-written definitions freeze old data

The merge loop in `modifierDefinitions.ts` (the catalog loop) copies only missing **options** and `inputLabel` into hand-written entries, never adders or sub-modifiers. As a result:

| Modifier | Missing in HW |
|---|---|
| CHARGES | all 12 adders: CLIPS, INCREASEDRELOAD, CONTINUING, FUEL, DIFFICULT/VERYDIFFICULT/EXTREMELYDIFFICULTFUEL, BOOSTABLE, RECOVERABLE, INCREASEDTIME, NEVERRECOVER, LIMITEDRECOVER |
| REQUIRESASKILLROLL | BURNOUT (-0), JAMMED (-½), CHOOSE (+¼), EVERYPHASE (-½) |
| DAMAGEOVERTIME | TIMEBETWEEN, a **required** adder, so every HW-built DOT has the wrong value; increments over 256 |
| TRIGGER | MISFIRE (-¼) |
| SIDEEFFECTS | AFTERUSE (+¼) |
| UOO | has a bogus `UOO` option that isn't in the template |

**Fix:** let the merge add the template's adders and sub-modifiers to hand-written entries, or delete hand-written entries whose only value is data the template already has (most of them).

### S4. No modifier applicability check ("Modifier Intelligence")

`modifierChoices()` (`editor/powers.ts`) offers every advantage and limitation for every power. HD rejects a modifier through `Modifier.included()`, which checks:

1. template `TYPE` (for example, Hardened only on DEFENSE, Beam only on ATTACK, Half Phase only on VPP)
2. template `DURATION`
3. `EXCLUDES` against the power's other modifiers, adders and XMLID
4. `REQUIRES`
5. a per-class `included()` override (rules in section 2)

The catalog already holds `types` and `excludes` for modifiers. `requires` and the per-class rules are missing.

**Fix:** a shared `modifierAllowed(power, modifier) → string | ''` that mirrors HD's messages. The dialog greys out or warns on disallowed choices, and existing items show a warning. HD has a "force allow" (`FORCEALLOW="Yes"`), so this should warn, not block.

### S5. END cost ignores modifiers

`powerCosts()` returns `end = Math.ceil(active / 10)` unless the power has no END. `parse.ts` does the same when the file has no `ENDCOST`. Nothing reads:

- Reduced Endurance: ½ END is figured on Active Points *excluding* the ½ END advantage, minimum 1 (6E1 345); 0 END means 0.
- Costs Endurance on a 0-END power (6E1 374).
- Increased Endurance Cost (x2 … x10) (6E1 374).
- Charges, which means no END unless Costs END (6E1 367).
- Costs END Only To Activate.

**Evidence** (Skralk): *Assume Human Form* (0 END in HD), *Suppress* (0 END), *Proteus Rod* (0 END) show 7, 5 and 2 END in HW.

hero6e works out END itself on upload, so this is a display error in the editor. It can still mislead users. The rounding rule (`ceil` versus HD's rounding) should be checked against HD's `getEndUsage` as part of the fix.

### S6. Context-dependent pricing HD computes and HW does not

| Rule | HD | 6E1 |
|---|---|---|
| Autofire +1 surcharge on non-DCV targets, Mental, NND/AVAD, Drain, Transform, Aid, Dispel, Healing, Suppress, Transfer, Succor (once only; not when ODDPOWER is chosen) | `Autofire.getTotalValue` | 327 |
| Reduced END costs double on an Autofire power | `ReducedEND.getTotalValue` | 327 |
| Delayed END costs double on an Autofire power | `DelayedEND.getTotalValue` | – |
| Increased END is worth half on a power with Costs END Only To Activate | `IncreasedEND.getTotalValue` | 345, 374 |
| Charges capped at +1, or at -0 when the power uses no END; Boostable raises the cap; Continuing removes it | `Charges.getTotalValue` | 367–371 |
| Boostable, Recoverable and Continuing priced by moving 1, 2 or *n* rows down the Charges table; Clips doubles per row | `Charges.setSelectedOption` | 368–370 |
| Linked is -½ when linked to an equal-or-greater power, -¼ when linked to a lesser one | `Linked.getBaseCost` | 383–385 |
| Side Effects gets an extra -¼ on a Constant or Persistent power with Requires A Roll | `SideEffects.getBaseCost` | 395 |
| Time Limit options depend on duration: Instant advantage table, Constant advantage table, or limitation table for Persistent powers and Telepathy, Mind Control, Entangle and Barrier | `TimeLimit.setParent` | 346–347 |
| Damage Over Time ignores ONEDEFENSE/LOCKOUT as advantages; doubles increments; doubles or zeroes time | `DamageOverTime.getTotalValue` | 330 |
| Every modifier value is rounded to the nearest ¼ (half up) before min/max clamping | `Modifier.getTotalValue` | – |

HW has none of these. Its `modifierValue()` only knows AOE, leveled modifiers, options and adders.

---

## 2. Per-modifier findings

Rows marked OK need no work apart from the systemic fixes above.

### Advantages

| Modifier | 6E1 | Book / HD rule | HW status |
|---|---|---|---|
| Affects Desolidified | 318 | +½ any, +¼ one SFX | OK |
| Alternate Combat Value | 318 | ±¼/+0 by direction; may be taken twice and summed | OK (catalog). **Book:** taking it twice |
| Area Of Effect | 319–324 | +¼ per doubling; min +¼; Explosion -½; Nonselective -¼ / Selective +¼ (exclusive); Mobile +½ then +¼ per doubling; Accurate +¼ (Radius); Thin Cone -¼; Fixed Shape -¼ (Any Area); Line can double width/height. HD: not on powers that already target an area (Explosion class) | **Data:** EXPLOSION, SELECTIVE, NONSELECTIVE, MOBILE, DOUBLEWIDTH/HEIGHT, FIXEDSHAPE missing (S1, S3). Size pricing OK (`aoeValue`) |
| Armor Piercing | 325 | +¼ per level; extra levels only counter Hardened. HD: not with NND; only on powers targeting others against a defense (STR, Teleport and maneuvers allowed) | **Rule** |
| AVAD / NND | 325–326 | ladder ±½ per step; All Or Nothing ½ less; AVAD attacks do STUN only (Does BODY +1); Autofire +1 | OK value; **Rule:** only powers that affect others with a standard defense (`AVLD`); Autofire surcharge (S6) |
| Autofire | 327 | +¼ 2–3 shots, +½ 5, +½ per doubling; +1 surcharge; Reduced END x2. HD: only powers needing an Attack Roll (STR, maneuvers, Absorption allowed) | **Cost:** surcharge, Reduced END x2 (S6). **Data:** DOUBLE offered on every option (S1). **Rule** |
| Charges (as advantage) | 327, 368 | see Charges below | – |
| Cumulative | 328 | +½, +¼ per doubling of max. HD: not Absorption/Aid/Healing/Succor/Transform, not damage powers, needs a defense and an Attack Roll | OK value; **Rule** |
| Damage Over Time | 328–330 | +1 base, increments and time tables, one-defense x2, lockout. HD: attacks, Mental, other-targeting Adjustment | **Data:** TIMEBETWEEN (required) missing; **Cost:** sub-modifiers (S2, S6); **Rule.** **Book:** Autofire needs GM permission |
| Delayed Effect | 332 | +¼, +¼ per doubling | OK (catalog) |
| Difficult To Dispel | 333 | +¼ per doubling. HD: not on Inherent | OK value; **Rule** |
| Does BODY | 333 | +1. HD: not Flash, not if the power already does BODY, only damaging powers | **Rule** |
| Does Knockback | 333 | +¼ | OK |
| Double Knockback | 334 | +½. HD: only powers that do Knockback | **Rule** |
| Constant | 334 | +½; converts Instant to Constant. HD: not if already Constant, Persistent or Inherent | **Rule** |
| Persistent | 334 | +¼; Constant, costs no END to maintain. HD: not CSLs, not Instant (apply Constant first), not END-to-activate-only | **Rule** |
| Inherent | 334 | +¼; must be 0 END and Persistent (usually Always On) | **Rule** |
| Hole In The Middle | 335 | +¼ fixed, +½ variable. HD: area powers only | **Rule** |
| Indirect | 335–337 | source + path table | OK. **Rule:** not on Self Only except Stretching |
| Invisible Power Effects | 338–339 | table OK. HD: not with Perceivable (VISIBLE) | **Rule.** **Book:** restricted IPE +¼; target-effect IPE requires the power itself to be IPE |
| MegaScale | 340–342 | +1 then +¼ per x10; "cannot alter scale" ¼ less; MegaMovement takes no NCM multiples (template excludes) | OK value. **Book:** applies only to area, movement or ranged powers |
| Penetrating | 342 | +½ per level; extra levels only counter Impenetrable. HD: not Defense powers, not NND, needs an Attack Roll | **Rule.** **Book:** not on AVADs or Normal Damage BODY |
| Personal Immunity | 343 | +¼ | OK |
| Increased Maximum Range | 344 | +¼ per x2. HD: ranged powers only | **Rule** |
| Line Of Sight | 344 | +½; ranged powers only. Template excludes NRM/HRM | OK (excludes, once S4 exists) |
| No / Half Range Modifier | 344 | +½ / +¼ | OK |
| Ranged (Limited, RBS) | 344 | +½ / +¼ / +¼. HD: not Self Only, Duplication, HA or Reflection; not already ranged (unless UOO) | **Rule.** **Book:** not on STR |
| Reduced Endurance | 345 | ½ END +¼ (END from AP without it, min 1); 0 END +½; x2 on Autofire. HD: not with Increased END, Costs END, END-only-to-activate or END to maintain; only powers that cost END (ignoring Charges) | **Cost:** x2 (S6), END (S5). **Rule** |
| Costs END Only To Activate | 345 | +¼; Constant only; not Mental; not with Reduced END; halves Increased END | **Rule**, **Cost** (S6) |
| Sticky | 345 | +½ / +¼. HD: only powers targeting others; Mental only with Based On CON | **Rule** |
| Time Limit | 346–348 | three tables by duration (see S6). HD: only Persistent, Constant or Instant; not END-to-maintain powers | **Data/Cost:** HW has a flat +¼ with no options. **Rule** |
| Transdimensional | 348 | +½ / +¾ / +1 | OK |
| Trigger | 349–352 | template table OK; min +¼; MULTIPLE only with Focus or Charges; Misfire -¼ | **Data:** MISFIRE missing (S3). **Rule:** MULTIPLE |
| Uncontrolled | 352 | +½; must be Constant | **Rule** |
| Usable On Others | 353–360 | UBO +¼, Simultaneously +½ (+¼ per x2), UNB +1, UAA +1¼; option-scoped adders; min +¼. HD: UAA only for powers with a defense or that target DCV/ECV; TARGETS only on Simultaneously/UAA | **Data:** wrong options/adders (S1, S3). **Rule.** **Book:** not with Self Only, Regeneration or (normally) Characteristics |
| Variable Advantage | 361 | 2x value; ¼ less for a limited group (min +½) | OK (catalog) |
| Variable Special Effects | 362 | +¼ group / +½ any | OK (catalog) |
| Expanded / Variable Effect, Delayed Return Rate, other Adjustment-only modifiers | Ch. 5 | ADJUSTMENT type only; Delayed Return Rate not on Healing | **Rule** |

### Limitations

| Modifier | 6E1 | Book / HD rule | HW status |
|---|---|---|---|
| Always On | 367 | -½ (Controllable -¼). HD: Persistent or Inherent only; no END; not with Focus or "stops when Stunned/KO'd" | **Rule** |
| Charges | 367–371 | table; no END; capped at +1 or -0 when the power uses no END; Boostable 1 row, Recoverable 2 rows, Continuing *n* rows by duration (Constant/Persistent only); Fuel ¼ and -0 cap on 0-END powers; Clips one row per doubling (applied last); Increased Recovery -½ per step (max -1¾); Never Recover -2; Restricted -¼ | **Data:** all adders missing; options only to 250 in the hand-written copy (S3). **Cost:** caps and row shifts (S6) |
| Concentration | 372–373 | -¼ ½ DCV, -½ 0 DCV, -¼ oblivious; x2 throughout | **Cost:** throughout sub-modifier (S2) |
| Instant | 373 | -½; Constant only; not with Constant/Persistent/Inherent advantages | **Rule** |
| Nonpersistent | 373 | -¼; Persistent only | **Rule** |
| Costs Endurance | 374 | -¼ activate, -½ every phase, Half END -¼. HD: only 0-END powers; not END Reserve; not with Reduced END or END-only-to-activate | **Rule.** END effect (S5) |
| Increased Endurance Cost | 374 | table; half value with END-only-to-activate; not 0-END powers; not with Reduced END; CIRCUMSTANCE reduction | **Cost** (S6), **Rule**, END (S5) |
| Extra Time | 374–376 | table to 1 Century; +¼ no other actions (not Full/Delayed Phase; HD: not attacks); Only to Activate halves (min -¼). HD: not Regeneration | **Cost:** Only to Activate (S2). **Data:** option scoping (S1). **Rule** |
| Focus | 376–380 | table + Arrangement/Bulky/Immobile, Fragile, Expendability, Multiple Foci ¼ less | OK. **Book:** not with OIAID or Perceivable (Obvious Focus) |
| Gestures | 381 | -¼, both hands -¼ (before doubling), x2 throughout | **Cost/Data:** throughout is a fake adder (S2) |
| Inaccurate | 381 | -¼ / -½ | OK (catalog) |
| Incantations | 381–382 | -¼, x2 throughout, Complex -¼ | **Cost/Data:** throughout (S2) |
| Limited / Conditional Power | 382–383 | guideline tables | OK (catalog) |
| Linked | 383–385 | -½ to greater, -¼ to lesser; ±¼ modifiers; LOS must match; Persistent linked to Instant/Constant becomes that | **Cost:** no target power, so always -½ (S6). **Book:** LOS match |
| Lockout | 386 | -½ | OK |
| No Conscious Control | 386 | -2 / -1 | OK |
| Only In Alternate Identity | 386 | -¼ | OK. **Book:** not with Focus or Extra Time (Full Phase) |
| Perceivable | 387 | -¼ / -¼ / -½ | OK |
| Physical Manifestation | 387 | -¼ | OK |
| Range limitations | 388 | No Range -½ (-1 if contact must be maintained), Limited -¼, RBS -¼, Reduced By Range -¼, Subject To Range Modifier -¼; template excludes | OK value; **Rule** (excludes; ranged powers only) |
| Reduced Penetration | 388 | -¼; ATTACK only | **Rule** (type) |
| Requires A Roll | 389–392 | table; min -¼; Burnout -0, Jammed -½ (neither on 1 Charge), Choose +¼, Every Phase -½ (Constant/Persistent only) | **Data:** adders missing (S3). **Book:** 1 Charge / Every Phase restrictions |
| Requires Multiple Users | 392 | table | OK (catalog) |
| Restrainable | 393 | -½ / -¼ | OK |
| Side Effects | 393–395 | -¼/-½/-1; x2 always occurs; ±¼ modifiers; extra -¼ on a Constant power with RAR | **Data:** AFTERUSE missing; **Cost:** ALWAYSOCCURS (S2), Constant+RAR (S6) |
| Unified Power | 395 | -¼, needs at least two abilities | OK. **Book:** two-ability minimum |
| Variable Limitations | 396 | -¼ per -½ chosen; HD rounds down | OK (catalog); check rounding |

### Cost formula rules (6E1 313–316, 365)

| Rule | HW |
|---|---|
| Active = Base x (1 + advantages); Real = Active / (1 + limitations); advantages and limitations never net against each other | OK (`powerCosts`) |
| Adders are added before Advantages | OK |
| Advantages on a power with free points (Running) apply to the total including the free part; Limitations apply only to the paid part | **Not checked yet** (characteristic-style powers) |
| Partially advantaged or limited powers | Not supported (HD neither; use compound powers) |
| Most limitations bottom out at -0; multipliers apply last | Partly (template `MAXCOST`) |

---

## 3. Recommended order

Progress (2026-10-21): step 1 is done, together with Charges' table pricing and cap from S6 (`priceChargesAdders`, `chargesMaxValue`). The editor now builds every modifier from the template; only option labels, Expanded Effect's name and the Spell limitation are hand-written. Tests: `packages/shared/test/modifier-adders.test.ts`. Step 2 (sub-modifiers, S2) is done too: parsed, priced with HD's formula (`withSubModifiers`), edited (offered per HD's rule, `subModifierOffered`) and written as nested `MODIFIER`s; tests in `sub-modifiers.test.ts`. Open question found along the way: HD shows a Custom Power of 22 AP with -¾ as Real Cost 12, not 13. Step 3 (S6) is done: `valueOnPower` (Autofire surcharge, Reduced END x2, Increased END half, Charges cap), Time Limit's tables by duration (`effectiveDuration`), and Linked's target and -¼/-½ (`relinkModifiers`); tests in `power-dependent-modifiers.test.ts`. Two S6 rows stay book-only warnings because HD 6E never applies them: its Autofire surcharge checks 5E's NND/AVLD IDs, so 6E's AVAD isn't surcharged (hero6e agrees), and Side Effects' extra -¼ checks 5E's REQUIRESSKILLROLL/ACTIVATIONROLL IDs. Step 4 (S5, END) is done: `powerEndCost` ports `GenericObject.getEndUsage` and is used by the editor and the parser (list modifiers included; an equipment compound's END is its parts'). Step 5 (S4, applicability) is done: `modifierProblem` in `src/modifierRules.ts` ports `Modifier.included` and the per-class overrides, with HD's messages, shown as warnings in the power dialog; tests in `modifier-rules.test.ts`. Across the Hero Designer-built samples it flags only Skralk's Teleportation with Ranged (HD would too). In the generated `.v2.hdc` files it flags Costs Endurance on powers that already cost END, which looks like a sheet-to-hdc mapping issue. Step 6 (book-only rules) is done: `modifierBookNotes` gives notes with 6E1 pages (Autofire on AVAD 327, DOT + Autofire 330, Penetrating on AVAD 342, Ranged STR 344, Continuing Charges 369, Nonpersistent + Costs END 373, Extra Time no-other-actions on attacks 374, Linked target/LOS 383–384, OIAID with Focus/Full Phase 387, RAR Burnout/Jammed/Every Phase 391, Restrainable + Accessible Focus 393, Side Effects + RAR on Constant 395, Unified Power pairs 395, UOO on Regeneration/characteristics/Self Only 360, Trigger set multiple times 352); tests in `modifier-book-notes.test.ts`. The modifier audit is complete; the Chapter Five power-by-power pass is next.

1. **Generator and data (S1, S3).** Emit option-scoped adders, `requires` and sub-modifiers; stop the hand-written definitions from hiding template adders; remove the bogus UOO option. Mechanical and low-risk, and it fixes Charges, Requires A Roll, Damage Over Time, Trigger, UOO and Area of Effect options at once. Test: every template adder is offered for its modifier and option.
2. **Sub-modifiers (S2).** Parse, edit and write nested `MODIFIER`s; price them with HD's formula. Test: the Skralk "superheat blade" comes out at -¾ and Real Cost 12.
3. **Context pricing (S6).** Port the HD overrides one at a time, each with a test from a 6E1 example (the SMG and VIPER AutoBlaster on 6E1 327, the Charges table examples on 6E1 370, Linked on 6E1 385).
4. **END (S5).** Shared `endCost(power)` covering Reduced END, Costs END, Increased END and Charges, checked against HD's `getEndUsage`.
5. **Applicability (S4).** `modifierAllowed()` with HD's messages; warn in the dialog and on existing items.
6. **Book-only warnings.** The **Book** items above as soft warnings with 6E1 page references.

Next audit pass: Chapter Five power descriptions (power-specific adders, limitations and rules), and characteristic-style powers with free points.
