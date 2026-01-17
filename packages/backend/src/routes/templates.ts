/**
 * Template Routes - Built-in character templates
 */

import { Router } from 'express';
import type { Template, ApiResponse } from '@hero-workshop/shared';

export const templatesRouter = Router();

// Built-in templates (matching the Java templates)
const builtInTemplates: Template[] = [
  {
    id: 'builtIn.Superheroic6E.hdt',
    name: 'Superheroic (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Heroic6E.hdt',
    name: 'Heroic (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Normal.hdt',
    name: 'Normal',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Vehicle6E.hdt',
    name: 'Vehicle (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Base6E.hdt',
    name: 'Base (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Automaton6E.hdt',
    name: 'Automaton (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.Computer6E.hdt',
    name: 'Computer (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
  {
    id: 'builtIn.AI6E.hdt',
    name: 'AI (6th Edition)',
    edition: '6e',
    characteristics: [],
    skills: [],
    perks: [],
    talents: [],
    powers: [],
    disadvantages: [],
  },
];

/**
 * GET /api/templates
 * List all available templates
 */
templatesRouter.get('/', (_req, res) => {
  const response: ApiResponse<Template[]> = {
    success: true,
    data: builtInTemplates,
  };
  res.json(response);
});

/**
 * GET /api/templates/:templateId
 * Get a specific template
 */
templatesRouter.get('/:templateId', (req, res) => {
  const { templateId } = req.params;
  const template = builtInTemplates.find((t) => t.id === templateId);

  if (!template) {
    res.status(404).json({
      success: false,
      error: `Template not found: ${templateId}`,
    });
    return;
  }

  const response: ApiResponse<Template> = {
    success: true,
    data: template,
  };
  res.json(response);
});
