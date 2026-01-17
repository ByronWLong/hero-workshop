import { useRef, useState } from 'react';
import type { Character } from '@hero-workshop/shared';

interface CharacterImageCardProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export function CharacterImageCard({ character, onUpdate }: CharacterImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageData = character.image?.data;
  
  // Detect image type from base64 header or use a default
  const getImageSrc = () => {
    if (!imageData) return null;
    
    // Check for common image format headers in base64
    if (imageData.startsWith('R0lGOD')) {
      return `data:image/gif;base64,${imageData}`;
    } else if (imageData.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${imageData}`;
    } else if (imageData.startsWith('iVBOR')) {
      return `data:image/png;base64,${imageData}`;
    } else if (imageData.startsWith('Qk')) {
      return `data:image/bmp;base64,${imageData}`;
    }
    // Default to trying as generic image
    return `data:image/png;base64,${imageData}`;
  };

  const imageSrc = getImageSrc();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a valid image file (PNG, JPEG, GIF, BMP, or WebP)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be smaller than 2MB');
      return;
    }

    setIsLoading(true);
    setError(null);

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
    } catch (err) {
      setError('Failed to load image');
      console.error('Image load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveImage = () => {
    onUpdate({
      ...character,
      image: undefined,
    });
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleNameChange = (value: string) => {
    onUpdate({
      ...character,
      characterInfo: {
        ...character.characterInfo,
        characterName: value,
      },
    });
  };

  const handlePlayerChange = (value: string) => {
    onUpdate({
      ...character,
      characterInfo: {
        ...character.characterInfo,
        playerName: value,
      },
    });
  };

  return (
    <div className="card">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Character Info fields */}
      <div className="form-group">
        <label className="form-label">Character Name</label>
        <input
          type="text"
          className="form-input"
          value={character.characterInfo.characterName}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Player Name</label>
        <input
          type="text"
          className="form-input"
          value={character.characterInfo.playerName ?? ''}
          onChange={(e) => handlePlayerChange(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* Image section */}
      {imageSrc ? (
        <div style={{ marginTop: '0.5rem' }}>
          <div 
            style={{ 
              width: '100%',
              maxHeight: '200px',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={handleClick}
            title="Click to change image"
          >
            <img
              src={imageSrc}
              alt={character.characterInfo.characterName}
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                objectFit: 'contain',
              }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button 
              className="btn btn-secondary" 
              onClick={handleClick}
              disabled={isLoading}
              style={{ flex: 1, padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}
            >
              {isLoading ? 'Loading...' : 'Change Image'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleRemoveImage}
              disabled={isLoading}
              title="Remove image"
              style={{ padding: '0.375rem 0.5rem' }}
            >
              🗑️
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={handleClick}
          style={{
            width: '100%',
            height: '120px',
            borderRadius: '0.5rem',
            border: '2px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-secondary)',
            transition: 'border-color 0.2s, background-color 0.2s',
            marginTop: '0.5rem',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-color)';
            e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
          }}
        >
          {isLoading ? (
            <>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                Loading...
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.5rem' }}>📷</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                Click to add image
              </span>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ 
          color: 'var(--error)', 
          fontSize: '0.75rem', 
          marginTop: '0.5rem',
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Convert a File to base64 string (without the data URL prefix)
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('Failed to extract base64 data'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}
