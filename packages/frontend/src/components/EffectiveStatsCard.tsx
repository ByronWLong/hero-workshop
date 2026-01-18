import { useMemo } from 'react';
import type { Character } from '@hero-workshop/shared';
import { calculateStatModifications } from '@hero-workshop/shared';

interface EffectiveStatsCardProps {
  character: Character;
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
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Combat Stats */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Combat
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {['STR', 'DEX', 'CON', 'INT', 'EGO', 'PRE', 'SPD', 'REC', 'END', 'BODY', 'STUN'].map(stat => {
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
        
        {/* Defenses - Combined PD/rPD and ED/rED display */}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Defenses
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            {/* PD Combined */}
            {(() => {
              const pdData = effectiveStats['PD'];
              const rpdData = effectiveStats['rPD'];
              const basePd = pdData?.base ?? getBaseCharacteristic(character, 'PD');
              const bonusPd = pdData?.bonus ?? 0;
              const totalPd = basePd + bonusPd;
              const rpdBonus = rpdData?.total ?? 0;
              const combinedTotal = totalPd + rpdBonus;
              
              if (bonusPd === 0 && rpdBonus === 0) return null;
              
              const sources = [...(pdData?.sources ?? []), ...(rpdData?.sources ?? [])];
              
              return (
                <div 
                  style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem',
                    backgroundColor: 'rgba(0, 100, 200, 0.1)',
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 100, 200, 0.3)',
                  }}
                  title={sources.join('\n')}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>PD</div>
                  <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                    {totalPd}/{combinedTotal}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ({rpdBonus > 0 ? `${rpdBonus}` : '0'} rPD)
                  </div>
                </div>
              );
            })()}
            
            {/* ED Combined */}
            {(() => {
              const edData = effectiveStats['ED'];
              const redData = effectiveStats['rED'];
              const baseEd = edData?.base ?? getBaseCharacteristic(character, 'ED');
              const bonusEd = edData?.bonus ?? 0;
              const totalEd = baseEd + bonusEd;
              const redBonus = redData?.total ?? 0;
              const combinedTotal = totalEd + redBonus;
              
              if (bonusEd === 0 && redBonus === 0) return null;
              
              const sources = [...(edData?.sources ?? []), ...(redData?.sources ?? [])];
              
              return (
                <div 
                  style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem',
                    backgroundColor: 'rgba(0, 100, 200, 0.1)',
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 100, 200, 0.3)',
                  }}
                  title={sources.join('\n')}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>ED</div>
                  <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
                    {totalEd}/{combinedTotal}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    ({redBonus > 0 ? `${redBonus}` : '0'} rED)
                  </div>
                </div>
              );
            })()}
          </div>
          
          {/* Other Defenses */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
            {['Mental Def', 'Power Def', 'Flash Def', 'KB Resist'].map(stat => {
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
