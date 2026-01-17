/**
 * Error Handler Middleware
 */

import type { Request, Response, NextFunction } from 'express';

interface ApiError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('API Error:', err);

  // Google API errors
  if (err.code === '401' || err.message?.includes('invalid_grant')) {
    res.status(401).json({
      success: false,
      error: 'Authentication expired, please log in again',
    });
    return;
  }

  if (err.code === '404' || err.message?.includes('File not found')) {
    res.status(404).json({
      success: false,
      error: 'File not found',
    });
    return;
  }

  if (err.code === '403') {
    res.status(403).json({
      success: false,
      error: 'Access denied to this file',
    });
    return;
  }

  // Default error response
  const status = err.status ?? 500;
  const message = process.env['NODE_ENV'] === 'production' 
    ? 'An internal error occurred' 
    : err.message;

  res.status(status).json({
    success: false,
    error: message,
  });
}
