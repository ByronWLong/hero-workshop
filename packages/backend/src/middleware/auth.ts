/**
 * Authentication Middleware
 */

import type { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.tokens) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  // Check if token is expired
  const expiryDate = req.session.tokens.expiry_date;
  if (expiryDate && Date.now() >= expiryDate) {
    // Token expired - clear session and require re-auth
    req.session.destroy(() => {
      res.status(401).json({
        success: false,
        error: 'Session expired, please log in again',
      });
    });
    return;
  }

  next();
}

/**
 * Get an authenticated Google OAuth2 client from the session
 */
export function getAuthenticatedClient(req: Request) {
  const oauth2Client = new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET']
  );

  if (req.session.tokens) {
    oauth2Client.setCredentials(req.session.tokens);
  }

  return oauth2Client;
}
