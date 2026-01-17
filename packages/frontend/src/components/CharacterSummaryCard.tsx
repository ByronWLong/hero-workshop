import { useState } from 'react';
import type { Character } from '@hero-workshop/shared';
import { calculateCostBreakdown, calculateDisadvantageTotal } from '@hero-workshop/shared';

interface CharacterSummaryCardProps {
  character: Character;
  onUpdate?: (character: Character) => void;
}

export function CharacterSummaryCard({ character, onUpdate }: CharacterSummaryCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  
  const basePoints = character.basicConfiguration.basePoints;
  const disadLimit = character.basicConfiguration.disadPoints;
  const experience = character.basicConfiguration.experience;
  const breakdown = calculateCostBreakdown(character);
  const totalSpent = breakdown.total;
  const disadsTaken = calculateDisadvantageTotal(character.disadvantages);
  const disadsMet = disadsTaken >= disadLimit;
  const totalAvailable = basePoints + experience;
  const remaining = totalAvailable - totalSpent;

  const handleBasePointsChange = (value: number) => {
    if (!onUpdate) return;
    onUpdate({
      ...character,
      basicConfiguration: {
        ...character.basicConfiguration,
        basePoints: value,
      },
    });
  };

  const handleDisadPointsChange = (value: number) => {
    if (!onUpdate) return;
    onUpdate({
      ...character,
      basicConfiguration: {
        ...character.basicConfiguration,
        disadPoints: value,
      },
    });
  };

  const handleExperienceChange = (value: number) => {
    if (!onUpdate) return;
    onUpdate({
      ...character,
      basicConfiguration: {
        ...character.basicConfiguration,
        experience: value,
      },
    });
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: '1rem' }}>Point Summary</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Base Points</span>
          {onUpdate ? (
            <input
              type="number"
              className="form-input"
              style={{ width: '80px', textAlign: 'right', padding: '0.25rem 0.5rem' }}
              value={basePoints}
              min={0}
              step={25}
              onChange={(e) => handleBasePointsChange(parseInt(e.target.value, 10) || 0)}
            />
          ) : (
            <span style={{ fontWeight: 600 }}>{basePoints}</span>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Complications</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ 
              fontWeight: 600,
              color: disadsMet ? 'var(--success)' : 'var(--warning)',
            }}>
              {disadsTaken} /
            </span>
            {onUpdate ? (
              <input
                type="number"
                className="form-input"
                style={{ width: '60px', textAlign: 'right', padding: '0.25rem 0.5rem' }}
                value={disadLimit}
                min={0}
                step={25}
                onChange={(e) => handleDisadPointsChange(parseInt(e.target.value, 10) || 0)}
              />
            ) : (
              <span style={{ fontWeight: 600 }}>{disadLimit}</span>
            )}
            {disadsMet && <span style={{ color: 'var(--success)' }}>✓</span>}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Experience</span>
          {onUpdate ? (
            <input
              type="number"
              className="form-input"
              style={{ width: '80px', textAlign: 'right', padding: '0.25rem 0.5rem' }}
              value={experience}
              min={0}
              onChange={(e) => handleExperienceChange(parseInt(e.target.value, 10) || 0)}
            />
          ) : (
            <span style={{ fontWeight: 600 }}>{experience}</span>
          )}
        </div>
        
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Available</span>
          <span style={{ fontWeight: 600 }}>{totalAvailable}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.75rem' }}>{showBreakdown ? '▼' : '▶'}</span>
            Total Spent
          </button>
          <span style={{ fontWeight: 600 }}>{totalSpent}</span>
        </div>
        
        {showBreakdown && (
          <div style={{ 
            background: 'var(--bg-secondary)', 
            borderRadius: '0.5rem', 
            padding: '0.75rem',
            fontSize: '0.875rem',
          }}>
            {breakdown.characteristics > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>💪 Characteristics</span>
                <span>{breakdown.characteristics}</span>
              </div>
            )}
            {breakdown.skills > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>📚 Skills</span>
                <span>{breakdown.skills}</span>
              </div>
            )}
            {breakdown.perks > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🎖️ Perks</span>
                <span>{breakdown.perks}</span>
              </div>
            )}
            {breakdown.talents > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>✨ Talents</span>
                <span>{breakdown.talents}</span>
              </div>
            )}
            {breakdown.martialArts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>🥋 Martial Arts</span>
                <span>{breakdown.martialArts}</span>
              </div>
            )}
            {breakdown.powers > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>⚡ Powers</span>
                <span>{breakdown.powers}</span>
              </div>
            )}
          </div>
        )}
        
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>Remaining</span>
          <span style={{ 
            fontWeight: 'bold', 
            fontSize: '1.25rem',
            color: remaining >= 0 ? 'var(--success)' : 'var(--error)' 
          }}>
            {remaining}
          </span>
        </div>
      </div>
    </div>
  );
}
