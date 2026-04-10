/**
 * Character Routes - CRUD operations for .hdc files in Google Drive
 */

import { Router } from 'express';
import { google } from 'googleapis';
import type { Character, CharacterSummary, ApiResponse, DriveFileList } from '@hero-workshop/shared';
import { requireAuth, getAuthenticatedClient } from '../middleware/auth.js';
import { parseHdcFile, serializeToHdc } from '../services/hdcParser.js';
import { Readable } from 'stream';

export const charactersRouter = Router();

// All character routes require authentication
charactersRouter.use(requireAuth);

/**
 * GET /api/characters
 * List all .hdc files from Google Drive
 */
charactersRouter.get('/', async (req, res, next) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: "fileExtension='hdc' and trashed=false",
      fields: 'files(id, name, modifiedTime, size, webViewLink, ownedByMe, description)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    const files = response.data.files ?? [];

    // For now, return basic file info. Full character parsing can be done on demand.
    const result: DriveFileList = {
      files: files.map((f) => ({
        id: f.id ?? '',
        name: f.name ?? '',
        mimeType: f.mimeType ?? 'application/xml',
        modifiedTime: f.modifiedTime ?? '',
        size: f.size ?? undefined,
        webViewLink: f.webViewLink ?? undefined,
        ownedByMe: f.ownedByMe ?? false,
        description: f.description ?? undefined,
      })),
    };

    res.json({ success: true, data: result } as ApiResponse<DriveFileList>);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/characters/:fileId
 * Load a specific character from Google Drive
 */
charactersRouter.get('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file content - use arraybuffer to handle UTF-16 encoding
    const response = await drive.files.get(
      { fileId: fileId ?? '', alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    // Convert arraybuffer to string, handling UTF-16 encoding
    let xmlContent: string;
    const buffer = Buffer.from(response.data as ArrayBuffer);
    
    // Check for UTF-16 BOM (FF FE for little-endian, FE FF for big-endian)
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      xmlContent = buffer.toString('utf16le');
    } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      // Big-endian UTF-16 - swap bytes
      const swapped = Buffer.alloc(buffer.length);
      for (let i = 0; i < buffer.length; i += 2) {
        swapped[i] = buffer[i + 1]!;
        swapped[i + 1] = buffer[i]!;
      }
      xmlContent = swapped.toString('utf16le');
    } else {
      // Assume UTF-8
      xmlContent = buffer.toString('utf8');
    }
    
    const character = parseHdcFile(xmlContent);

    res.json({ success: true, data: character } as ApiResponse<Character>);
  } catch (error) {
    console.error('[Characters] Error loading character:', error);
    next(error);
  }
});

/**
 * GET /api/characters/:fileId/summary
 * Get character summary without full parsing
 */
charactersRouter.get('/:fileId/summary', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata
    const metaResponse = await drive.files.get({
      fileId: fileId ?? '',
      fields: 'id, name, modifiedTime',
    });

    // Get file content for basic parsing
    const contentResponse = await drive.files.get(
      { fileId: fileId ?? '', alt: 'media' },
      { responseType: 'text' }
    );

    const xmlContent = contentResponse.data as string;
    const character = parseHdcFile(xmlContent);

    const summary: CharacterSummary = {
      fileId: metaResponse.data.id ?? '',
      fileName: metaResponse.data.name ?? '',
      characterName: character.characterInfo.characterName,
      playerName: character.characterInfo.playerName,
      basePoints: character.basicConfiguration.basePoints,
      totalPoints: character.basicConfiguration.basePoints + character.basicConfiguration.disadPoints,
      modifiedTime: metaResponse.data.modifiedTime ?? '',
    };

    res.json({ success: true, data: summary } as ApiResponse<CharacterSummary>);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/characters/:fileId
 * Save/update a character to Google Drive
 */
charactersRouter.put('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const character: Character = req.body;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const xmlContent = serializeToHdc(character);

    // Update file content
    await drive.files.update({
      fileId: fileId ?? '',
      media: {
        mimeType: 'application/xml',
        body: Readable.from([xmlContent]),
      },
    });

    res.json({ success: true, data: { fileId } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/characters
 * Create a new character in Google Drive
 */
charactersRouter.post('/', async (req, res, next) => {
  try {
    const { character, fileName, folderId } = req.body as {
      character: Character;
      fileName: string;
      folderId?: string;
    };

    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const xmlContent = serializeToHdc(character);

    const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
      name: fileName.endsWith('.hdc') ? fileName : `${fileName}.hdc`,
      mimeType: 'application/xml',
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'application/xml',
        body: Readable.from([xmlContent]),
      },
      fields: 'id, name, webViewLink',
    });

    res.json({
      success: true,
      data: {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/characters/:fileId
 * Move a character file to trash
 */
charactersRouter.delete('/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    await drive.files.update({
      fileId: fileId ?? '',
      requestBody: {
        trashed: true,
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/characters/:fileId/tags
 * Update tags for a character file (stored in description field)
 */
charactersRouter.patch('/:fileId/tags', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { tags } = req.body as { tags: string[] };
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Store tags as JSON in the description field
    const description = JSON.stringify({ tags: tags ?? [] });

    await drive.files.update({
      fileId: fileId ?? '',
      requestBody: {
        description,
      },
      fields: 'id, description',
    });

    res.json({ success: true, data: { tags } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/characters/:fileId/share
 * Share a character file with another user via Google Drive
 */
charactersRouter.post('/:fileId/share', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { email, role = 'reader', sendNotification = true } = req.body as {
      email: string;
      role?: 'reader' | 'writer' | 'commenter';
      sendNotification?: boolean;
    };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email address is required' });
      return;
    }

    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create permission for the user
    await drive.permissions.create({
      fileId: fileId ?? '',
      sendNotificationEmail: sendNotification,
      requestBody: {
        type: 'user',
        role: role,
        emailAddress: email,
      },
    });

    res.json({ success: true, data: { email, role } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/characters/:fileId/permissions
 * List all permissions for a character file
 */
charactersRouter.get('/:fileId/permissions', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.permissions.list({
      fileId: fileId ?? '',
      fields: 'permissions(id, type, role, emailAddress, displayName)',
    });

    const permissions = (response.data.permissions ?? []).map(p => ({
      id: p.id ?? '',
      type: p.type ?? '',
      role: p.role ?? '',
      emailAddress: p.emailAddress ?? undefined,
      displayName: p.displayName ?? undefined,
    }));

    res.json({ success: true, data: { permissions } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/characters/:fileId/permissions/:permissionId
 * Remove a permission from a character file
 */
charactersRouter.delete('/:fileId/permissions/:permissionId', async (req, res, next) => {
  try {
    const { fileId, permissionId } = req.params;
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    await drive.permissions.delete({
      fileId: fileId ?? '',
      permissionId: permissionId ?? '',
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
