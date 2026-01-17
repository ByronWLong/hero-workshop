import type { Character, Characteristic as CharacteristicType } from '@hero-workshop/shared';

interface CharacteristicsTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// HERO System 6th Edition characteristic costs
const CHAR_COSTS: Record<string, { baseCost: number; baseValue: number }> = {
  STR: { baseCost: 1, baseValue: 10 },
  DEX: { baseCost: 2, baseValue: 10 },
  CON: { baseCost: 2, baseValue: 10 },
  INT: { baseCost: 1, baseValue: 10 },
  EGO: { baseCost: 1, baseValue: 10 },
  PRE: { baseCost: 1, baseValue: 10 },
  OCV: { baseCost: 5, baseValue: 3 },
  DCV: { baseCost: 5, baseValue: 3 },
  OMCV: { baseCost: 3, baseValue: 3 },
  DMCV: { baseCost: 3, baseValue: 3 },
  SPD: { baseCost: 10, baseValue: 2 },
  PD: { baseCost: 1, baseValue: 2 },
  ED: { baseCost: 1, baseValue: 2 },
  REC: { baseCost: 1, baseValue: 4 },
  END: { baseCost: 0.2, baseValue: 20 },
  BODY: { baseCost: 1, baseValue: 10 },
  STUN: { baseCost: 0.5, baseValue: 20 },
  RUNNING: { baseCost: 1, baseValue: 12 },
  SWIMMING: { baseCost: 1, baseValue: 4 },
  LEAPING: { baseCost: 1, baseValue: 4 },
};

// Calculate STR-based values
function calculateLift(str: number): string {
  if (str <= 0) return '0 kg';
  if (str <= 5) return `${Math.round(str * 10)} kg`;
  
  // HERO System lifting table
  const liftTable: [number, string][] = [
    [5, '50 kg'], [10, '100 kg'], [15, '200 kg'], [20, '400 kg'],
    [25, '800 kg'], [30, '1,600 kg'], [35, '3,200 kg'], [40, '6,400 kg'],
    [45, '12.5 tons'], [50, '25 tons'], [55, '50 tons'], [60, '100 tons'],
    [65, '200 tons'], [70, '400 tons'], [75, '800 tons'], [80, '1,600 tons'],
    [85, '3,200 tons'], [90, '6,400 tons'], [95, '12,800 tons'], [100, '25,600 tons'],
  ];
  
  for (const [threshold, lift] of liftTable) {
    if (str <= threshold) return lift;
  }
  return '50,000+ tons';
}

function calculateDamageDice(str: number): string {
  if (str <= 0) return '0d6';
  const dice = Math.floor(str / 5);
  const remainder = str % 5;
  
  if (remainder === 0) return `${dice}d6`;
  if (remainder >= 3) return `${dice}½d6`;
  return `${dice}d6+1`;
}

function calculateCharacteristicRoll(value: number): string {
  const roll = 9 + Math.floor(value / 5);
  return `${roll}-`;
}

export function CharacteristicsTab({ character, onUpdate }: CharacteristicsTabProps) {
  const primaryStats: Array<{ type: string; label: string; color: string; showRoll?: boolean }> = [
    { type: 'STR', label: 'Strength', color: 'var(--stat-str)', showRoll: true },
    { type: 'DEX', label: 'Dexterity', color: 'var(--stat-dex)', showRoll: true },
    { type: 'CON', label: 'Constitution', color: 'var(--stat-con)', showRoll: true },
    { type: 'INT', label: 'Intelligence', color: 'var(--stat-int)', showRoll: true },
    { type: 'EGO', label: 'Ego', color: 'var(--stat-ego)', showRoll: true },
    { type: 'PRE', label: 'Presence', color: 'var(--stat-pre)', showRoll: true },
  ];

  const combatStats = [
    { type: 'OCV', label: 'OCV' },
    { type: 'DCV', label: 'DCV' },
    { type: 'OMCV', label: 'OMCV' },
    { type: 'DMCV', label: 'DMCV' },
  ];

  const derivedStats = [
    { type: 'SPD', label: 'Speed' },
    { type: 'PD', label: 'PD' },
    { type: 'ED', label: 'ED' },
    { type: 'REC', label: 'Recovery' },
    { type: 'END', label: 'Endurance' },
    { type: 'BODY', label: 'Body' },
    { type: 'STUN', label: 'Stun' },
  ];

  const movementStats = [
    { type: 'RUNNING', label: 'Running', unit: 'm' },
    { type: 'SWIMMING', label: 'Swimming', unit: 'm' },
    { type: 'LEAPING', label: 'Leaping', unit: 'm' },
  ];

  const getCharacteristic = (type: string): CharacteristicType | undefined => {
    return character.characteristics.find((c) => c.type === type);
  };

  const calculateCost = (type: string, value: number): number => {
    const config = CHAR_COSTS[type];
    if (!config) return 0;
    const levelsBought = value - config.baseValue;
    return Math.ceil(levelsBought * config.baseCost);
  };

  const handleValueChange = (type: string, newValue: number) => {
    const config = CHAR_COSTS[type];
    const baseValue = config?.baseValue ?? 10;
    const cost = calculateCost(type, newValue);

    const updatedChars = character.characteristics.map((c) => {
      if (c.type === type) {
        return {
          ...c,
          totalValue: newValue,
          levels: newValue - baseValue,
          baseCost: cost,
          realCost: cost,
        };
      }
      return c;
    });

    onUpdate({
      ...character,
      characteristics: updatedChars,
    });
  };

  const strValue = getCharacteristic('STR')?.totalValue ?? 10;

  return (
    <div className="characteristics-tab">
      {/* STR Derived Values */}
      <section style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ background: 'var(--surface-light)', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Lift
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--stat-str)' }}>
                {calculateLift(strValue)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                HTH Damage
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--stat-str)' }}>
                {calculateDamageDice(strValue)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Throw Distance
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--stat-str)' }}>
                {strValue * 2}m
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Primary Characteristics</h3>
        <div className="characteristics-grid">
          {primaryStats.map(({ type, label, color, showRoll }) => {
            const char = getCharacteristic(type);
            const value = char?.totalValue ?? (CHAR_COSTS[type]?.baseValue ?? 10);
            const cost = calculateCost(type, value);
            return (
              <div key={type} className="characteristic-item">
                <div className="characteristic-name">{label}</div>
                <input
                  type="number"
                  className="characteristic-value"
                  value={value}
                  onChange={(e) => handleValueChange(type, parseInt(e.target.value) || 0)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color,
                    width: '100%',
                    textAlign: 'center',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                  }}
                />
                {showRoll && (
                  <div className="characteristic-roll">
                    Roll: {calculateCharacteristicRoll(value)}
                  </div>
                )}
                <div className="characteristic-cost">
                  {cost} pts
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Combat Values</h3>
        <div className="characteristics-grid">
          {combatStats.map(({ type, label }) => {
            const char = getCharacteristic(type);
            const value = char?.totalValue ?? (CHAR_COSTS[type]?.baseValue ?? 3);
            const cost = calculateCost(type, value);
            return (
              <div key={type} className="characteristic-item">
                <div className="characteristic-name">{label}</div>
                <input
                  type="number"
                  className="characteristic-value"
                  value={value}
                  onChange={(e) => handleValueChange(type, parseInt(e.target.value) || 0)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    width: '100%',
                    textAlign: 'center',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                  }}
                />
                <div className="characteristic-cost">
                  {cost} pts
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Secondary Characteristics</h3>
        <div className="characteristics-grid">
          {derivedStats.map(({ type, label }) => {
            const char = getCharacteristic(type);
            const value = char?.totalValue ?? (CHAR_COSTS[type]?.baseValue ?? 0);
            const cost = calculateCost(type, value);
            return (
              <div key={type} className="characteristic-item">
                <div className="characteristic-name">{label}</div>
                <input
                  type="number"
                  className="characteristic-value"
                  value={value}
                  onChange={(e) => handleValueChange(type, parseInt(e.target.value) || 0)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    width: '100%',
                    textAlign: 'center',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                  }}
                />
                <div className="characteristic-cost">
                  {cost} pts
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Movement</h3>
        <div className="characteristics-grid">
          {movementStats.map(({ type, label, unit }) => {
            const char = getCharacteristic(type);
            const value = char?.totalValue ?? (CHAR_COSTS[type]?.baseValue ?? 0);
            const cost = calculateCost(type, value);
            return (
              <div key={type} className="characteristic-item">
                <div className="characteristic-name">{label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
                  <input
                    type="number"
                    className="characteristic-value"
                    value={value}
                    onChange={(e) => handleValueChange(type, parseInt(e.target.value) || 0)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      width: '60%',
                      textAlign: 'right',
                      fontSize: '2rem',
                      fontWeight: 'bold',
                    }}
                  />
                  <span className="movement-unit">{unit}</span>
                </div>
                <div className="characteristic-cost">
                  {cost} pts
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
