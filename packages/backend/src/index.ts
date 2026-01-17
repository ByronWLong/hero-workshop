/**
 * Hero Workshop - Backend API Entry Point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth.js';
import { charactersRouter } from './routes/characters.js';
import { templatesRouter } from './routes/templates.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] ?? 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: true,
  })
);

// Logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret: process.env['SESSION_SECRET'] ?? 'hero-workshop-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env['NODE_ENV'] === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/templates', templatesRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🦸 Hero Workshop API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});

export default app;
