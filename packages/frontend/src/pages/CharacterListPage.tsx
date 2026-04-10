import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterList, useCreateCharacter } from '../hooks/useCharacter';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Modal } from '../components/Modal';
import type { Character, DriveFile } from '@hero-workshop/shared';
import { api } from '../services/api';

// Default characteristics for a new 6th edition character
const DEFAULT_CHARACTERISTICS = [
  { id: 'STR', name: 'Strength', alias: 'STR', abbreviation: 'STR', position: 0, levels: 0, baseCost: 0, type: 'STR' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'DEX', name: 'Dexterity', alias: 'DEX', abbreviation: 'DEX', position: 1, levels: 0, baseCost: 0, type: 'DEX' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'CON', name: 'Constitution', alias: 'CON', abbreviation: 'CON', position: 2, levels: 0, baseCost: 0, type: 'CON' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'INT', name: 'Intelligence', alias: 'INT', abbreviation: 'INT', position: 3, levels: 0, baseCost: 0, type: 'INT' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'EGO', name: 'Ego', alias: 'EGO', abbreviation: 'EGO', position: 4, levels: 0, baseCost: 0, type: 'EGO' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'PRE', name: 'Presence', alias: 'PRE', abbreviation: 'PRE', position: 5, levels: 0, baseCost: 0, type: 'PRE' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'OCV', name: 'Offensive Combat Value', alias: 'OCV', abbreviation: 'OCV', position: 6, levels: 0, baseCost: 0, type: 'OCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'DCV', name: 'Defensive Combat Value', alias: 'DCV', abbreviation: 'DCV', position: 7, levels: 0, baseCost: 0, type: 'DCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'OMCV', name: 'Offensive Mental Combat Value', alias: 'OMCV', abbreviation: 'OMCV', position: 8, levels: 0, baseCost: 0, type: 'OMCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'DMCV', name: 'Defensive Mental Combat Value', alias: 'DMCV', abbreviation: 'DMCV', position: 9, levels: 0, baseCost: 0, type: 'DMCV' as const, baseValue: 3, totalValue: 3, affectsPrimary: true, affectsTotal: true },
  { id: 'SPD', name: 'Speed', alias: 'SPD', abbreviation: 'SPD', position: 10, levels: 0, baseCost: 0, type: 'SPD' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'PD', name: 'Physical Defense', alias: 'PD', abbreviation: 'PD', position: 11, levels: 0, baseCost: 0, type: 'PD' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'ED', name: 'Energy Defense', alias: 'ED', abbreviation: 'ED', position: 12, levels: 0, baseCost: 0, type: 'ED' as const, baseValue: 2, totalValue: 2, affectsPrimary: true, affectsTotal: true },
  { id: 'REC', name: 'Recovery', alias: 'REC', abbreviation: 'REC', position: 13, levels: 0, baseCost: 0, type: 'REC' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
  { id: 'END', name: 'Endurance', alias: 'END', abbreviation: 'END', position: 14, levels: 0, baseCost: 0, type: 'END' as const, baseValue: 20, totalValue: 20, affectsPrimary: true, affectsTotal: true },
  { id: 'BODY', name: 'Body', alias: 'BODY', abbreviation: 'BODY', position: 15, levels: 0, baseCost: 0, type: 'BODY' as const, baseValue: 10, totalValue: 10, affectsPrimary: true, affectsTotal: true },
  { id: 'STUN', name: 'Stun', alias: 'STUN', abbreviation: 'STUN', position: 16, levels: 0, baseCost: 0, type: 'STUN' as const, baseValue: 20, totalValue: 20, affectsPrimary: true, affectsTotal: true },
  { id: 'RUNNING', name: 'Running', alias: 'Running', abbreviation: 'RUN', position: 17, levels: 0, baseCost: 0, type: 'RUNNING' as const, baseValue: 12, totalValue: 12, affectsPrimary: true, affectsTotal: true },
  { id: 'SWIMMING', name: 'Swimming', alias: 'Swimming', abbreviation: 'SWIM', position: 18, levels: 0, baseCost: 0, type: 'SWIMMING' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
  { id: 'LEAPING', name: 'Leaping', alias: 'Leaping', abbreviation: 'LEAP', position: 19, levels: 0, baseCost: 0, type: 'LEAPING' as const, baseValue: 4, totalValue: 4, affectsPrimary: true, affectsTotal: true },
];

const TEMPLATES = [
  { id: 'builtIn.Superheroic6E.hdt', name: 'Superheroic (6th Edition)', basePoints: 400, disadPoints: 75 },
  { id: 'builtIn.Heroic6E.hdt', name: 'Heroic (6th Edition)', basePoints: 175, disadPoints: 50 },
  { id: 'builtIn.Follower6E.hdt', name: 'Follower (6th Edition)', basePoints: 100, disadPoints: 30 },
  { id: 'builtIn.Normal.hdt', name: 'Normal', basePoints: 50, disadPoints: 25 },
];

function createDefaultCharacter(name: string, playerName: string, templateId: string): Character {
  const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[1]!;
  
  return {
    version: '6.0',
    basicConfiguration: {
      basePoints: template.basePoints,
      disadPoints: template.disadPoints,
      experience: 0,
    },
    characterInfo: {
      characterName: name,
      playerName: playerName,
    },
    characteristics: DEFAULT_CHARACTERISTICS,
    skills: [],
    perks: [],
    talents: [],
    martialArts: [],
    powers: [],
    disadvantages: [],
    equipment: [],
  };
}

export function CharacterListPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useCharacterList();
  const createCharacter = useCreateCharacter();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('builtIn.Heroic6E.hdt');
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Filter states
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'shared'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Tag management modal
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagEditFile, setTagEditFile] = useState<DriveFile | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  
  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'reader' | 'writer'>('reader');
  const [shareNotify, setShareNotify] = useState(true);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [permissions, setPermissions] = useState<Array<{ id: string; type: string; role: string; emailAddress?: string; displayName?: string }>>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [knownEmails, setKnownEmails] = useState<Set<string>>(new Set());

  // Helper to parse tags from description
  const parseTags = (description?: string): string[] => {
    if (!description) return [];
    try {
      const parsed = JSON.parse(description);
      return parsed.tags ?? [];
    } catch {
      return [];
    }
  };

  // Get all unique tags from all files
  const allTags = useMemo(() => {
    const files = data?.files ?? [];
    const tagSet = new Set<string>();
    files.forEach(file => {
      parseTags(file.description).forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [data?.files]);

  // Filter files based on current filters
  const filteredFiles = useMemo(() => {
    let files = data?.files ?? [];
    
    // Filter by ownership
    if (ownershipFilter === 'mine') {
      files = files.filter(f => f.ownedByMe);
    } else if (ownershipFilter === 'shared') {
      files = files.filter(f => !f.ownedByMe);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      files = files.filter(f => f.name.toLowerCase().includes(query));
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      files = files.filter(f => {
        const fileTags = parseTags(f.description);
        return selectedTags.every(tag => fileTags.includes(tag));
      });
    }
    
    return files;
  }, [data?.files, ownershipFilter, searchQuery, selectedTags]);

  // Open tag editor
  const openTagEditor = (file: DriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagEditFile(file);
    setEditingTags(parseTags(file.description));
    setNewTagInput('');
    setIsTagModalOpen(true);
  };

  // Save tags
  const handleSaveTags = async () => {
    if (!tagEditFile) return;
    try {
      await api.patch(`/characters/${tagEditFile.id}/tags`, { tags: editingTags });
      setIsTagModalOpen(false);
      refetch();
    } catch (err) {
      console.error('Failed to save tags:', err);
    }
  };

  // Add a new tag
  const addTag = () => {
    const tag = newTagInput.trim();
    if (tag && !editingTags.includes(tag)) {
      setEditingTags([...editingTags, tag]);
      setNewTagInput('');
    }
  };

  // Remove a tag
  const removeTag = (tag: string) => {
    setEditingTags(editingTags.filter(t => t !== tag));
  };

  // Toggle tag filter
  const toggleTagFilter = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Open share modal
  const openShareModal = async (file: DriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareFile(file);
    setShareEmail('');
    setShareRole('reader');
    setShareNotify(true);
    setShareError(null);
    setShareSuccess(null);
    setIsShareModalOpen(true);
    
    // Load current permissions
    setLoadingPermissions(true);
    try {
      const response = await api.get<{ success: boolean; data: { permissions: Array<{ id: string; type: string; role: string; emailAddress?: string; displayName?: string }> } }>(`/characters/${file.id}/permissions`);
      const perms = response.data?.permissions ?? [];
      setPermissions(perms);
      
      // Add emails to known emails for suggestions
      const newEmails = new Set(knownEmails);
      perms.forEach(p => {
        if (p.emailAddress && p.type === 'user' && p.role !== 'owner') {
          newEmails.add(p.emailAddress);
        }
      });
      setKnownEmails(newEmails);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setPermissions([]);
    } finally {
      setLoadingPermissions(false);
    }
  };

  // Handle sharing
  const handleShare = async () => {
    if (!shareFile || !shareEmail.trim()) return;
    
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);
    
    try {
      await api.post(`/characters/${shareFile.id}/share`, {
        email: shareEmail.trim(),
        role: shareRole,
        sendNotification: shareNotify,
      });
      setShareSuccess(`Shared with ${shareEmail.trim()}`);
      
      // Add to known emails
      setKnownEmails(prev => new Set([...prev, shareEmail.trim()]));
      setShareEmail('');
      
      // Refresh permissions
      const response = await api.get<{ success: boolean; data: { permissions: Array<{ id: string; type: string; role: string; emailAddress?: string; displayName?: string }> } }>(`/characters/${shareFile.id}/permissions`);
      setPermissions(response.data?.permissions ?? []);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to share character');
    } finally {
      setIsSharing(false);
    }
  };

  // Remove a permission
  const handleRemovePermission = async (permissionId: string) => {
    if (!shareFile) return;
    
    try {
      await api.delete(`/characters/${shareFile.id}/permissions/${permissionId}`);
      setPermissions(permissions.filter(p => p.id !== permissionId));
    } catch (err) {
      console.error('Failed to remove permission:', err);
    }
  };

  const handleNewCharacter = () => {
    setCharacterName('');
    setPlayerName('');
    setSelectedTemplate('builtIn.Heroic6E.hdt');
    setCreateError(null);
    setIsModalOpen(true);
  };

  const handleCreateCharacter = async () => {
    if (!characterName.trim()) {
      setCreateError('Character name is required');
      return;
    }

    try {
      setCreateError(null);
      const character = createDefaultCharacter(characterName.trim(), playerName.trim(), selectedTemplate);
      const result = await createCharacter.mutateAsync({
        character,
        fileName: characterName.trim(),
      });
      
      setIsModalOpen(false);
      if (result?.fileId) {
        navigate(`/characters/${result.fileId}`);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create character');
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
        <p>Loading characters from Google Drive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Error Loading Characters</div>
        <p>{error instanceof Error ? error.message : 'An error occurred'}</p>
      </div>
    );
  }

  const files = data?.files ?? [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Characters</h1>
        <button className="btn btn-primary" onClick={handleNewCharacter}>
          + New Character
        </button>
      </div>

      {/* Filter Controls */}
      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '1rem', 
        backgroundColor: 'var(--surface)', 
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {/* Search and ownership filter row */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search characters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: '1',
              minWidth: '200px',
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
            }}
          />
          <select
            value={ownershipFilter}
            onChange={(e) => setOwnershipFilter(e.target.value as 'all' | 'mine' | 'shared')}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--background)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="all">All Characters</option>
            <option value="mine">My Characters</option>
            <option value="shared">Shared with Me</option>
          </select>
          <button
            onClick={() => {
              setOwnershipFilter('all');
              setSearchQuery('');
              setSelectedTags([]);
            }}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'var(--surface-light)',
              color: 'var(--text-secondary)',
              cursor: (ownershipFilter !== 'all' || searchQuery || selectedTags.length > 0) ? 'pointer' : 'default',
              fontSize: '0.875rem',
              visibility: (ownershipFilter !== 'all' || searchQuery || selectedTags.length > 0) ? 'visible' : 'hidden',
            }}
          >
            Clear filters
          </button>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Tags:</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '12px',
                  border: selectedTags.includes(tag) ? '1px solid var(--primary-color)' : '1px solid var(--color-border)',
                  backgroundColor: selectedTags.includes(tag) ? 'var(--primary-color)' : 'transparent',
                  color: selectedTags.includes(tag) ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  transition: 'all 0.2s',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        
        {/* Results count */}
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Showing {filteredFiles.length} of {files.length} characters
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🦸</div>
          <div className="empty-state-title">No Characters Yet</div>
          <p>Create your first character to get started!</p>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '1rem' }}
            onClick={handleNewCharacter}
          >
            Create Character
          </button>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No Matching Characters</div>
          <p>Try adjusting your filters</p>
        </div>
      ) : (
        <div className="character-grid">
          {filteredFiles.map((file) => {
            const fileTags = parseTags(file.description);
            return (
              <div
                key={file.id}
                className="character-card"
                onClick={() => navigate(`/characters/${file.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="character-name">
                    {file.name.replace('.hdc', '')}
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {file.ownedByMe && (
                      <button
                        onClick={(e) => openShareModal(file, e)}
                        style={{
                          padding: '0.25rem',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '1rem',
                          opacity: 0.6,
                        }}
                        title="Share"
                      >
                        🔗
                      </button>
                    )}
                    <button
                      onClick={(e) => openTagEditor(file, e)}
                      style={{
                        padding: '0.25rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        opacity: 0.6,
                      }}
                      title="Edit tags"
                    >
                      🏷️
                    </button>
                  </div>
                </div>
                <div className="character-player">
                  Last modified: {new Date(file.modifiedTime).toLocaleDateString()}
                  {file.ownedByMe === false && <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>(shared)</span>}
                </div>
                {fileTags.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {fileTags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '0.125rem 0.375rem',
                          borderRadius: '8px',
                          backgroundColor: 'var(--surface-light)',
                          fontSize: '0.7rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="character-stats">
                  {file.size && (
                    <span className="character-stat">
                      📄 {Math.round(parseInt(file.size) / 1024)} KB
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tag Editor Modal */}
      <Modal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        title={`Edit Tags - ${tagEditFile?.name.replace('.hdc', '') ?? ''}`}
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIsTagModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveTags}>
              Save Tags
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Current tags */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Current Tags</label>
            {editingTags.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No tags yet</div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {editingTags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      fontSize: '0.875rem',
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '1rem',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {/* Add new tag */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Add Tag</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                placeholder="Enter tag name"
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                }}
              />
              <button className="btn btn-secondary" onClick={addTag} disabled={!newTagInput.trim()}>
                Add
              </button>
            </div>
          </div>
          
          {/* Suggested tags from other files */}
          {allTags.filter(t => !editingTags.includes(t)).length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Existing Tags
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {allTags.filter(t => !editingTags.includes(t)).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setEditingTags([...editingTags, tag])}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      border: '1px dashed var(--color-border)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Share Modal */}
      <Modal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={`Share - ${shareFile?.name.replace('.hdc', '') ?? ''}`}
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIsShareModalOpen(false)}>
              Done
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Share form */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Share with</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                placeholder="Enter email address"
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                }}
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as 'reader' | 'writer')}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <option value="reader">Viewer</option>
                <option value="writer">Editor</option>
              </select>
              <button 
                className="btn btn-primary" 
                onClick={handleShare} 
                disabled={!shareEmail.trim() || isSharing}
              >
                {isSharing ? '...' : 'Share'}
              </button>
            </div>
          </div>
          
          {/* Email suggestions */}
          {(() => {
            const currentPermsEmails = new Set(permissions.map(p => p.emailAddress).filter(Boolean));
            const suggestions = Array.from(knownEmails).filter(email => 
              !currentPermsEmails.has(email) && 
              email.toLowerCase().includes(shareEmail.toLowerCase())
            );
            if (suggestions.length === 0 || !shareEmail.trim()) return null;
            return (
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Suggestions:</span>
                {suggestions.slice(0, 5).map(email => (
                  <button
                    key={email}
                    onClick={() => setShareEmail(email)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '12px',
                      border: '1px dashed var(--color-border)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    {email}
                  </button>
                ))}
              </div>
            );
          })()}
          
          {/* Notify checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={shareNotify}
              onChange={(e) => setShareNotify(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <span>Notify people via email</span>
          </label>
          
          {/* Error/Success messages */}
          {shareError && (
            <div style={{ color: 'var(--color-error)', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
              {shareError}
            </div>
          )}
          {shareSuccess && (
            <div style={{ color: 'var(--color-success, #22c55e)', padding: '0.5rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: '4px' }}>
              {shareSuccess}
            </div>
          )}
          
          {/* Current permissions */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>People with access</label>
            {loadingPermissions ? (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Loading...</div>
            ) : permissions.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Only you have access</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {permissions.map(perm => (
                  <div
                    key={perm.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem',
                      backgroundColor: 'var(--surface-light)',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{perm.displayName ?? perm.emailAddress ?? perm.type}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {perm.role === 'owner' ? 'Owner' : perm.role === 'writer' ? 'Editor' : 'Viewer'}
                      </div>
                    </div>
                    {perm.role !== 'owner' && perm.type === 'user' && (
                      <button
                        onClick={() => handleRemovePermission(perm.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: '1.25rem',
                          color: 'var(--text-secondary)',
                          padding: '0.25rem',
                        }}
                        title="Remove access"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Character"
        size="small"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setIsModalOpen(false)}
              disabled={createCharacter.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateCharacter}
              disabled={createCharacter.isPending || !characterName.trim()}
            >
              {createCharacter.isPending ? 'Creating...' : 'Create Character'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {createError && (
            <div className="error-message" style={{ color: 'var(--color-error)', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
              {createError}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="characterName" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Character Name <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="characterName"
              type="text"
              className="input"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Enter character name"
              autoFocus
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="playerName" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Player Name
            </label>
            <input
              id="playerName"
              type="text"
              className="input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter player name (optional)"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="template" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Character Template
            </label>
            <select
              id="template"
              className="input"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
            >
              {TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.basePoints} + {template.disadPoints} pts)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
