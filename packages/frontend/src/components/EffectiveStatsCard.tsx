import { useMemo } from 'react';
import type { Character } from '@hero-workshop/shared';

interface EffectiveStatsCardProps {
  character: Character;
}

interface StatModification {
  source: string;
  stat: string;
  amount: number;
  active: boolean;
}

/**
 * Calculate modifications to characteristics from powers and equipment
 */
function calculateStatModifications(character: Character): StatModification[] {
  const modifications: StatModification[] = [];
  
  // Process powers
  const powers = character.powers ?? [];
  for (const power of powers) {
    const levels = power.levels ?? 1;
    const powerName = power.alias || power.name;
    const powerType = power.type ?? '';
    
    // Density Increase adds STR, PD, ED, mass
    if (powerType === 'DENSITY_INCREASE' || power.name.toLowerCase().includes('density increase')) {
      modifications.push(
        { source: powerName, stat: 'STR', amount: levels * 5, active: true },
        { source: powerName, stat: 'PD', amount: levels, active: true },
        { source: powerName, stat: 'ED', amount: levels, active: true },
        { source: powerName, stat: 'Mass', amount: levels * 100, active: true }, // Rough kg per level
      );
    }
    
    // Growth adds STR, CON, PD, ED, BODY, STUN, but reduces DCV/OCV, KB
    if (powerType === 'GROWTH' || power.name.toLowerCase().includes('growth')) {
      // Each level = +5 STR, +1 PD, +1 ED, +1 BODY, +2 STUN, -2m KB
      // At certain thresholds: size categories change
      modifications.push(
        { source: powerName, stat: 'STR', amount: levels * 5, active: true },
        { source: powerName, stat: 'CON', amount: levels, active: true },
        { source: powerName, stat: 'PD', amount: levels, active: true },
        { source: powerName, stat: 'ED', amount: levels, active: true },
        { source: powerName, stat: 'BODY', amount: levels, active: true },
        { source: powerName, stat: 'STUN', amount: levels * 2, active: true },
      );
      if (levels >= 6) {
        modifications.push({ source: powerName, stat: 'DCV', amount: -1, active: true });
      }
      if (levels >= 12) {
        modifications.push({ source: powerName, stat: 'DCV', amount: -1, active: true });
      }
    }
    
    // Shrinking reduces perception of character
    if (powerType === 'SHRINKING' || power.name.toLowerCase().includes('shrinking')) {
      modifications.push(
        { source: powerName, stat: 'DCV', amount: Math.floor(levels / 3), active: true },
        { source: powerName, stat: 'Perception', amount: -levels * 2, active: true },
      );
    }
    
    // Resistant Protection / Forcefield
    if (powerType === 'RESISTANT_PROTECTION' || 
        power.name.toLowerCase().includes('resistant protection') ||
        power.name.toLowerCase().includes('forcefield') ||
        power.name.toLowerCase().includes('force field')) {
      // Typically split between PD and ED - we'll show total
      modifications.push(
        { source: powerName, stat: 'rPD', amount: levels, active: true },
        { source: powerName, stat: 'rED', amount: levels, active: true },
      );
    }
    
    // Armor
    if (powerType === 'ARMOR' || power.name.toLowerCase().includes('armor')) {
      modifications.push(
        { source: powerName, stat: 'rPD', amount: levels, active: true },
        { source: powerName, stat: 'rED', amount: levels, active: true },
      );
    }
    
    // Flash Defense
    if (powerType === 'FLASH_DEFENSE' || power.name.toLowerCase().includes('flash defense')) {
      modifications.push(
        { source: powerName, stat: 'Flash Def', amount: levels, active: true },
      );
    }
    
    // Mental Defense
    if (powerType === 'MENTAL_DEFENSE' || power.name.toLowerCase().includes('mental defense')) {
      modifications.push(
        { source: powerName, stat: 'Mental Def', amount: levels, active: true },
      );
    }
    
    // Power Defense
    if (powerType === 'POWER_DEFENSE' || power.name.toLowerCase().includes('power defense')) {
      modifications.push(
        { source: powerName, stat: 'Power Def', amount: levels, active: true },
      );
    }
    
    // KB Resistance
    if (powerType === 'KNOCKBACK_RESISTANCE' || power.name.toLowerCase().includes('knockback resist')) {
      modifications.push(
        { source: powerName, stat: 'KB Resist', amount: levels, active: true },
      );
    }
    
    // Movement powers
    if (powerType === 'FLIGHT' || power.name.toLowerCase().includes('flight')) {
      modifications.push(
        { source: powerName, stat: 'Flight', amount: levels, active: true },
      );
    }
    if (powerType === 'RUNNING' || power.name.toLowerCase() === 'running') {
      modifications.push(
        { source: powerName, stat: 'Running', amount: levels, active: true },
      );
    }
    if (powerType === 'SWIMMING' || power.name.toLowerCase() === 'swimming') {
      modifications.push(
        { source: powerName, stat: 'Swimming', amount: levels, active: true },
      );
    }
    if (powerType === 'LEAPING' || power.name.toLowerCase() === 'leaping') {
      modifications.push(
        { source: powerName, stat: 'Leaping', amount: levels, active: true },
      );
    }
    if (powerType === 'TELEPORTATION' || power.name.toLowerCase().includes('teleport')) {
      modifications.push(
        { source: powerName, stat: 'Teleport', amount: levels, active: true },
      );
    }
  }
  
  // Process equipment (for carried equipment with powers)
  const equipment = character.equipment ?? [];
  for (const item of equipment) {
    if (!item.carried) continue;
    if (!item.activeCost || item.activeCost === 0) continue;
    
    const itemName = item.alias || item.name;
    const levels = item.levels ?? 1;
    
    // Check for defensive equipment
    if (item.name.toLowerCase().includes('armor') || 
        item.name.toLowerCase().includes('protection') ||
        item.name.toLowerCase().includes('shield')) {
      modifications.push(
        { source: `⚔️ ${itemName}`, stat: 'rPD', amount: levels, active: true },
        { source: `⚔️ ${itemName}`, stat: 'rED', amount: levels, active: true },
      );
    }
  }
  
  return modifications;
}

/**
 * Get the base value of a characteristic
 */
function getBaseCharacteristic(character: Character, type: string): number {
  const char = character.characteristics?.find(c => c.type === type);
  return char?.totalValue ?? char?.baseValue ?? getDefaultBase(type);
}

function getDefaultBase(type: string): number {
  const defaults: Record<string, number> = {
    STR: 10, DEX: 10, CON: 10, INT: 10, EGO: 10, PRE: 10,
    OCV: 3, DCV: 3, OMCV: 3, DMCV: 3,
    SPD: 2, PD: 2, ED: 2, REC: 4, END: 20, BODY: 10, STUN: 20,
    RUNNING: 12, SWIMMING: 4, LEAPING: 4,
  };
  return defaults[type] ?? 0;
}

/**
 * Calculate STR-based HTH damage
 */
function calculateHthDamage(str: number): string {
  const fullDice = Math.floor(str / 5);
  const remainder = str % 5;
  
  if (remainder === 0) return `${fullDice}d6`;
  if (remainder === 1 || remainder === 2) return fullDice > 0 ? `${fullDice}d6+${remainder}` : `+${remainder}`;
  if (remainder === 3) return `${fullDice}½d6`;
  return `${fullDice + 1}d6-1`;
}

/**
 * Calculate lifting capacity from STR
 */
function calculateLift(str: number): string {
  if (str <= 0) return '0 kg';
  
  const liftTable: [number, string][] = [
    [5, '50 kg'], [10, '100 kg'], [15, '200 kg'], [20, '400 kg'],
    [25, '800 kg'], [30, '1,600 kg'], [35, '3,200 kg'], [40, '6,400 kg'],
    [45, '12.5 tons'], [50, '25 tons'], [55, '50 tons'], [60, '100 tons'],
    [65, '200 tons'], [70, '400 tons'], [75, '800 tons'], [80, '1,600 tons'],
  ];
  
  for (const [threshold, lift] of liftTable) {
    if (str <= threshold) return lift;
  }
  return '3,200+ tons';
}

export function EffectiveStatsCard({ character }: EffectiveStatsCardProps) {
  const modifications = useMemo(() => calculateStatModifications(character), [character]);
  
  // Calculate effective values
  const effectiveStats = useMemo(() => {
    const stats: Record<string, { base: number; bonus: number; total: number; sources: string[] }> = {};
    
    // Start with base characteristics
    const charTypes = ['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'OCV', 'DCV', 'OMCV', 'DMCV', 
                       'SPD', 'PD', 'ED', 'REC', 'END', 'BODY', 'STUN', 'RUNNING', 'SWIMMING', 'LEAPING'];
    
    for (const type of charTypes) {
      const base = getBaseCharacteristic(character, type);
      stats[type] = { base, bonus: 0, total: base, sources: [] };
    }
    
    // Add power-granted stats
    const powerStats = ['rPD', 'rED', 'Flash Def', 'Mental Def', 'Power Def', 'KB Resist', 
                        'Flight', 'Teleport', 'Mass'];
    for (const type of powerStats) {
      stats[type] = { base: 0, bonus: 0, total: 0, sources: [] };
    }
    
    // Apply modifications
    for (const mod of modifications) {
      if (!mod.active) continue;
      
      if (!stats[mod.stat]) {
        stats[mod.stat] = { base: 0, bonus: 0, total: 0, sources: [] };
      }
      
      const stat = stats[mod.stat]!;
      stat.bonus += mod.amount;
      stat.total = stat.base + stat.bonus;
      stat.sources.push(`${mod.source}: ${mod.amount >= 0 ? '+' : ''}${mod.amount}`);
    }
    
    return stats;
  }, [character, modifications]);
  
  // Get effective STR for damage calculations
  const effectiveStr = effectiveStats['STR']?.total ?? 10;
  const hthDamage = calculateHthDamage(effectiveStr);
  const lifting = calculateLift(effectiveStr);
  
  // Check if there are any modifications
  const hasModifications = modifications.some(m => m.active);
  
  if (!hasModifications) {
    return null; // Don't render if no modifications
  }
  
  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: '1rem' }}>
        ⚡ Effective Stats
        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
          (with active powers)
        </span>
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Combat Stats */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Combat
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {['STR', 'DEX', 'CON', 'SPD'].map(stat => {
              const data = effectiveStats[stat];
              if (!data || data.bonus === 0) return null;
              return (
                <div 
                  key={stat} 
                  style={{ 
                    textAlign: 'center', 
                    padding: '0.5rem',
                    backgroundColor: 'var(--background-secondary)',
                    borderRadius: '4px',
                  }}
                  title={data.sources.join('\n')}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{stat}</div>
                  <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>{data.total}</div>
                  {data.bonus !== 0 && (
                    <div style={{ fontSize: '0.625rem', color: data.bonus > 0 ? 'var(--success)' : 'var(--error)' }}>
                      ({data.base} {data.bonus > 0 ? '+' : ''}{data.bonus})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* HTH Damage */}
        {(effectiveStats['STR']?.bonus ?? 0) > 0 && (
          <div style={{ 
            padding: '0.75rem', 
            backgroundColor: 'rgba(200, 50, 50, 0.1)', 
            borderRadius: '4px',
            border: '1px solid rgba(200, 50, 50, 0.3)',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Effective HTH Damage
            </div>
            <div style={{ fontWeight: 600, fontSize: '1.25rem', color: 'var(--danger-color)' }}>
              {hthDamage}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Lift: {lifting}
            </div>
          </div>
        )}
        
        {/* Defenses */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Defenses
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {['PD', 'ED', 'rPD', 'rED', 'Mental Def', 'Power Def'].map(stat => {
              const data = effectiveStats[stat];
              if (!data || data.total === 0) return null;
              return (
                <div 
                  key={stat} 
                  style={{ 
                    textAlign: 'center', 
                    padding: '0.5rem',
                    backgroundColor: stat.startsWith('r') ? 'rgba(0, 100, 200, 0.1)' : 'var(--background-secondary)',
                    borderRadius: '4px',
                    border: stat.startsWith('r') ? '1px solid rgba(0, 100, 200, 0.3)' : 'none',
                  }}
                  title={data.sources.join('\n')}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{stat}</div>
                  <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{data.total}</div>
                  {data.bonus !== 0 && (
                    <div style={{ fontSize: '0.625rem', color: 'var(--success)' }}>
                      (+{data.bonus})
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Movement */}
        {((effectiveStats['Flight']?.total ?? 0) > 0 || 
          (effectiveStats['Teleport']?.total ?? 0) > 0 ||
          (effectiveStats['RUNNING']?.bonus ?? 0) > 0 ||
          (effectiveStats['LEAPING']?.bonus ?? 0) > 0) && (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
              Movement
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {['RUNNING', 'LEAPING', 'SWIMMING', 'Flight', 'Teleport'].map(stat => {
                const data = effectiveStats[stat];
                if (!data || data.total === 0) return null;
                return (
                  <div 
                    key={stat} 
                    style={{ 
                      textAlign: 'center', 
                      padding: '0.5rem',
                      backgroundColor: 'var(--background-secondary)',
                      borderRadius: '4px',
                    }}
                    title={data.sources.join('\n')}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{stat}</div>
                    <div style={{ fontWeight: 600 }}>{data.total}m</div>
                    {data.bonus !== 0 && (
                      <div style={{ fontSize: '0.625rem', color: 'var(--success)' }}>
                        (+{data.bonus}m)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Modification Sources */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Active Powers/Equipment
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {[...new Set(modifications.filter(m => m.active).map(m => m.source))].map(source => (
              <span 
                key={source}
                style={{ 
                  fontSize: '0.75rem',
                  padding: '0.125rem 0.5rem',
                  backgroundColor: 'var(--primary-color)',
                  color: 'white',
                  borderRadius: '12px',
                }}
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
