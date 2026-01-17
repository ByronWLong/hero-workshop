/**
 * Authentication Routes - Google OAuth2
 */

import { Router } from 'express';
import { google } from 'googleapis';
import type { UserInfo, ApiResponse } from '@hero-workshop/shared';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// OAuth2 client configuration
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    `${process.env['FRONTEND_URL']?.replace(':5173', ':3001') ?? 'http://localhost:3001'}/api/auth/callback`
  );
}

// Extend Express Session
declare module 'express-session' {
  interface SessionData {
    tokens?: {
      access_token?: string | null;
      refresh_token?: string | null;
      expiry_date?: number | null;
    };
    user?: UserInfo;
  }
}

/**
 * GET /api/auth/login
 * Redirect to Google OAuth consent screen
 */
authRouter.get('/login', (_req, res) => {
  const oauth2Client = getOAuth2Client();

  const scopes = [
    'https://www.googleapis.com/auth/drive',         // Full read/write access to Drive files
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  res.redirect(authUrl);
});

/**
 * GET /api/auth/callback
 * OAuth2 callback from Google
 */
authRouter.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.redirect(`${process.env['FRONTEND_URL']}?error=no_code`);
    return;
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    // Store in session
    req.session.tokens = tokens;
    req.session.user = {
      id: data.id ?? '',
      email: data.email ?? '',
      name: data.name ?? '',
      picture: data.picture ?? undefined,
    };

    // Redirect to frontend
    res.redirect(`${process.env['FRONTEND_URL']}/characters`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env['FRONTEND_URL']}?error=auth_failed`);
  }
});

/**
 * GET /api/auth/user
 * Get current authenticated user
 */
authRouter.get('/user', requireAuth, (req, res) => {
  const response: ApiResponse<UserInfo> = {
    success: true,
    data: req.session.user,
  };
  res.json(response);
});

/**
 * POST /api/auth/logout
 * Clear session and logout
 */
authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ success: false, error: 'Logout failed' });
      return;
    }
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
authRouter.get('/status', (req, res) => {
  res.json({
    authenticated: !!req.session.tokens,
    user: req.session.user ?? null,
  });
});
