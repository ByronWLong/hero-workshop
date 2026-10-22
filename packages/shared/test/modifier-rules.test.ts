import { describe, expect, it } from 'vitest';
import { addModifier, blankHdc, modifierProblem, parseHdcFile, powerDraft, powerFormView } from '../src/index.js';

const on = (xmlId: string, modifiers: { xmlId: string; optionId?: string; value?: number }[] = [], baseCost = 40) => ({
  xmlId,
  modifiers: modifiers.map((m) => ({ value: 0, ...m })),
  baseCost,
});

describe("Which modifiers a power can take (Hero Designer's Modifier Intelligence)", () => {
  it('checks the template types', () => {
    expect(modifierProblem('HARDENED', on('ENERGYBLAST'))).toBe('Hardened can only be applied to abilities of type defense.');
    expect(modifierProblem('HARDENED', on('FORCEFIELD'))).toBe('');
    expect(modifierProblem('HARDENED', on('ENTANGLE'))).toBe(''); // the one exception
    expect(modifierProblem('BEAM', on('FORCEFIELD'))).toMatch(/type attack/);
  });

  it('checks targets, range and knockback', () => {
    expect(modifierProblem('AUTOFIRE', on('FLIGHT'))).toBe('Autofire can only be applied to abilities which require an Attack Roll.');
    expect(modifierProblem('AUTOFIRE', on('ENERGYBLAST'))).toBe('');
    expect(modifierProblem('RANGED', on('ENERGYBLAST'))).toBe('Blast is already Ranged.');
    expect(modifierProblem('NORANGE', on('ENERGYBLAST', [{ xmlId: 'RANGED' }]))).toBe('No Range cannot be applied to Powers that have taken the Ranged Advantage.');
    expect(modifierProblem('DOUBLEKB', on('DRAIN'))).toBe('Double Knockback can only be applied to abilities which do Knockback.');
    expect(modifierProblem('HOLEINTHEMIDDLE', on('ENERGYBLAST'))).toBe('Hole In The Middle can only be applied to abilities which affect an area.');
    expect(modifierProblem('HOLEINTHEMIDDLE', on('ENERGYBLAST', [{ xmlId: 'AOE' }]))).toBe('');
  });

  it('checks END and duration', () => {
    expect(modifierProblem('REDUCEDEND', on('FORCEFIELD'))).toBe('Resistant Protection does not cost END.');
    expect(modifierProblem('COSTSEND', on('FORCEFIELD'))).toBe('');
    expect(modifierProblem('COSTSEND', on('ENERGYBLAST'))).toBe('Costs Endurance cannot be applied to an ability which already costs END.');
    // ...but a power on Charges costs no END, so it can be made to
    expect(modifierProblem('COSTSEND', on('ENERGYBLAST', [{ xmlId: 'CHARGES', optionId: 'EIGHT' }]))).toBe('');
    expect(modifierProblem('ALWAYSON', on('ENERGYBLAST'))).toBe('Always On may only be applied to abilities which are either Persistent or Inherent');
    expect(modifierProblem('PERSISTENT', on('ENERGYBLAST'))).toBe('Persistent cannot be applied to Instant Powers -- apply Constant first.');
    expect(modifierProblem('CONTINUOUS', on('DARKNESS'))).toBe('Darkness is already Constant in duration.');
    expect(modifierProblem('DOESBODY', on('ENERGYBLAST'))).toBe('Blast already does BODY Damage.');
    expect(modifierProblem('DOESBODY', on('ENERGYBLAST', [{ xmlId: 'AVAD' }]))).toBe('');
  });

  it("warns in the power dialog, keeping the modifier", () => {
    const xml = blankHdc().replace('<POWERS />', `<POWERS>
      <POWER XMLID="ENERGYBLAST" ID="9400" BASECOST="0.0" LEVELS="8" ALIAS="Blast" POSITION="0" NAME="Bolt" INPUT="ED" QUANTITY="1" />
    </POWERS>`);
    const c = parseHdcFile(xml);
    const draft = addModifier(addModifier(powerDraft(c, 'powers', '9400'), 'HARDENED'), 'ARMORPIERCING');
    expect(powerFormView(c, 'powers', draft, '9400').modifiers.map((m) => m.problem)).toEqual([
      'Hardened can only be applied to abilities of type defense.',
      '',
    ]);
  });
});
