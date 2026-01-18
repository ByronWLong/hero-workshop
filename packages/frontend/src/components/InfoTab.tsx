import { useRef, useState } from 'react';
import type { Character } from '@hero-workshop/shared';

interface InfoTabProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export function InfoTab({ character, onUpdate }: InfoTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const info = character.characterInfo;
  const imageData = character.image?.data;

  // Detect image type from base64 header
  const getImageSrc = () => {
    if (!imageData) return null;
    if (imageData.startsWith('R0lGOD')) return `data:image/gif;base64,${imageData}`;
    if (imageData.startsWith('/9j/')) return `data:image/jpeg;base64,${imageData}`;
    if (imageData.startsWith('iVBOR')) return `data:image/png;base64,${imageData}`;
    if (imageData.startsWith('Qk')) return `data:image/bmp;base64,${imageData}`;
    return `data:image/png;base64,${imageData}`;
  };

  const imageSrc = getImageSrc();

  const updateInfo = (field: keyof typeof info, value: string | number | undefined) => {
    onUpdate({
      ...character,
      characterInfo: {
        ...character.characterInfo,
        [field]: value,
      },
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setImageError('Please select a valid image file (PNG, JPEG, GIF, BMP, or WebP)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setImageError('Image must be smaller than 2MB');
      return;
    }

    setIsLoadingImage(true);
    setImageError(null);

    try {
      const base64 = await fileToBase64(file);
      onUpdate({
        ...character,
        image: {
          data: base64,
          fileName: file.name,
          filePath: file.name,
        },
      });
    } catch {
      setImageError('Failed to load image');
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    onUpdate({
      ...character,
      image: undefined,
    });
  };

  return (
    <div className="info-tab">
      {/* Basic Info Row */}
      <div className="info-section">
        <h3 className="section-title">📋 Basic Information</h3>
        <div className="info-grid">
          <div className="info-field">
            <label className="form-label">Character Name</label>
            <input
              type="text"
              className="form-input"
              value={info.characterName}
              onChange={(e) => updateInfo('characterName', e.target.value)}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Alternate Identities</label>
            <input
              type="text"
              className="form-input"
              value={info.alternateIdentities ?? ''}
              onChange={(e) => updateInfo('alternateIdentities', e.target.value || undefined)}
              placeholder="Other names, aliases..."
            />
          </div>
          <div className="info-field">
            <label className="form-label">Player Name</label>
            <input
              type="text"
              className="form-input"
              value={info.playerName ?? ''}
              onChange={(e) => updateInfo('playerName', e.target.value || undefined)}
            />
          </div>
        </div>
      </div>

      {/* Campaign Info Row */}
      <div className="info-section">
        <h3 className="section-title">🎭 Campaign</h3>
        <div className="info-grid">
          <div className="info-field">
            <label className="form-label">Campaign Name</label>
            <input
              type="text"
              className="form-input"
              value={info.campaignName ?? ''}
              onChange={(e) => updateInfo('campaignName', e.target.value || undefined)}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Genre</label>
            <input
              type="text"
              className="form-input"
              value={info.genre ?? ''}
              onChange={(e) => updateInfo('genre', e.target.value || undefined)}
              placeholder="Fantasy Hero, Champions, etc."
            />
          </div>
          <div className="info-field">
            <label className="form-label">GM</label>
            <input
              type="text"
              className="form-input"
              value={info.gm ?? ''}
              onChange={(e) => updateInfo('gm', e.target.value || undefined)}
            />
          </div>
        </div>
      </div>

      {/* Physical Description Row */}
      <div className="info-section">
        <h3 className="section-title">👤 Physical Description</h3>
        <div className="info-grid info-grid-physical">
          <div className="info-field">
            <label className="form-label">Height (cm)</label>
            <input
              type="number"
              className="form-input"
              value={info.height ?? ''}
              onChange={(e) => updateInfo('height', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="180"
            />
          </div>
          <div className="info-field">
            <label className="form-label">Weight (kg)</label>
            <input
              type="number"
              className="form-input"
              value={info.weight ?? ''}
              onChange={(e) => updateInfo('weight', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="80"
            />
          </div>
          <div className="info-field">
            <label className="form-label">Hair Color</label>
            <input
              type="text"
              className="form-input"
              value={info.hairColor ?? ''}
              onChange={(e) => updateInfo('hairColor', e.target.value || undefined)}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Eye Color</label>
            <input
              type="text"
              className="form-input"
              value={info.eyeColor ?? ''}
              onChange={(e) => updateInfo('eyeColor', e.target.value || undefined)}
            />
          </div>
        </div>
      </div>

      {/* Image Section */}
      <div className="info-section">
        <h3 className="section-title">🖼️ Character Image</h3>
        <div className="image-section">
          <div className="image-preview-large">
            {imageSrc ? (
              <img src={imageSrc} alt={info.characterName} />
            ) : (
              <div className="no-image-large">
                <span>📷</span>
                <p>No image</p>
              </div>
            )}
          </div>
          <div className="image-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingImage}
            >
              {isLoadingImage ? 'Loading...' : imageSrc ? 'Change Image' : 'Upload Image'}
            </button>
            {imageSrc && (
              <button className="btn btn-danger" onClick={handleRemoveImage}>
                Remove
              </button>
            )}
            {imageError && <p className="error-text">{imageError}</p>}
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="info-section">
        <h3 className="section-title">✨ Appearance</h3>
        <textarea
          className="form-input form-textarea"
          value={info.appearance ?? ''}
          onChange={(e) => updateInfo('appearance', e.target.value || undefined)}
          placeholder="Describe the character's physical appearance..."
          rows={4}
        />
      </div>

      {/* Background */}
      <div className="info-section">
        <h3 className="section-title">📜 Background</h3>
        <textarea
          className="form-input form-textarea"
          value={info.background ?? ''}
          onChange={(e) => updateInfo('background', e.target.value || undefined)}
          placeholder="Character history, origin story, important events..."
          rows={6}
        />
      </div>

      {/* Personality */}
      <div className="info-section">
        <h3 className="section-title">🧠 Personality</h3>
        <textarea
          className="form-input form-textarea"
          value={info.personality ?? ''}
          onChange={(e) => updateInfo('personality', e.target.value || undefined)}
          placeholder="Character traits, quirks, motivations..."
          rows={4}
        />
      </div>

      {/* Quote */}
      <div className="info-section">
        <h3 className="section-title">💬 Quote</h3>
        <textarea
          className="form-input form-textarea"
          value={info.quote ?? ''}
          onChange={(e) => updateInfo('quote', e.target.value || undefined)}
          placeholder="A signature line or catchphrase..."
          rows={2}
        />
      </div>

      {/* Tactics */}
      <div className="info-section">
        <h3 className="section-title">⚔️ Tactics</h3>
        <textarea
          className="form-input form-textarea"
          value={info.tactics ?? ''}
          onChange={(e) => updateInfo('tactics', e.target.value || undefined)}
          placeholder="How the character approaches combat and challenges..."
          rows={4}
        />
      </div>

      {/* Campaign Use */}
      <div className="info-section">
        <h3 className="section-title">🎲 Campaign Use</h3>
        <textarea
          className="form-input form-textarea"
          value={info.campaignUse ?? ''}
          onChange={(e) => updateInfo('campaignUse', e.target.value || undefined)}
          placeholder="Notes for the GM on how to use this character..."
          rows={4}
        />
      </div>

      {/* Notes */}
      <div className="info-section">
        <h3 className="section-title">📝 Notes</h3>
        <div className="notes-grid">
          <div className="info-field">
            <label className="form-label">Notes 1</label>
            <textarea
              className="form-input form-textarea"
              value={info.notes1 ?? ''}
              onChange={(e) => updateInfo('notes1', e.target.value || undefined)}
              rows={3}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Notes 2</label>
            <textarea
              className="form-input form-textarea"
              value={info.notes2 ?? ''}
              onChange={(e) => updateInfo('notes2', e.target.value || undefined)}
              rows={3}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Notes 3</label>
            <textarea
              className="form-input form-textarea"
              value={info.notes3 ?? ''}
              onChange={(e) => updateInfo('notes3', e.target.value || undefined)}
              rows={3}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Notes 4</label>
            <textarea
              className="form-input form-textarea"
              value={info.notes4 ?? ''}
              onChange={(e) => updateInfo('notes4', e.target.value || undefined)}
              rows={3}
            />
          </div>
          <div className="info-field">
            <label className="form-label">Notes 5</label>
            <textarea
              className="form-input form-textarea"
              value={info.notes5 ?? ''}
              onChange={(e) => updateInfo('notes5', e.target.value || undefined)}
              rows={3}
            />
          </div>
        </div>
      </div>

      <style>{`
        .info-tab {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .info-section {
          background: var(--surface);
          border-radius: 8px;
          padding: 1.25rem;
          border: 1px solid var(--border);
        }

        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .info-grid-physical {
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        }

        .info-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .form-textarea {
          resize: vertical;
          min-height: 60px;
          font-family: inherit;
          line-height: 1.5;
        }

        .image-section {
          display: flex;
          gap: 1.5rem;
          align-items: flex-start;
        }

        .image-preview-large {
          width: 200px;
          height: 250px;
          border-radius: 8px;
          overflow: hidden;
          background: var(--background);
          border: 2px dashed var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .image-preview-large img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .no-image-large {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
        }

        .no-image-large span {
          font-size: 3rem;
          opacity: 0.5;
        }

        .image-controls {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .error-text {
          color: var(--danger);
          font-size: 0.875rem;
        }

        .notes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .image-section {
            flex-direction: column;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}

// Helper function to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix to get just the base64
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
