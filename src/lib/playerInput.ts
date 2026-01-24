import { z } from 'zod';

// Centralized input validation/sanitization for player/guest names.
// React JSX escaping already mitigates XSS, but we still guard against:
// - extremely long input (layout/data issues)
// - control characters
// - common HTML-breaking characters

const playerNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Escribe un nombre' })
  .max(100, { message: 'El nombre debe tener máximo 100 caracteres' })
  .transform((value) => {
    // Remove control chars and common HTML tag breakers.
    const noControls = value.replace(/[\u0000-\u001F\u007F]/g, '');
    const noHtmlBreakers = noControls.replace(/[<>"']/g, '');
    // Normalize whitespace
    return noHtmlBreakers.replace(/\s+/g, ' ').trim();
  });

export const validatePlayerName = (raw: string) => {
  const parsed = playerNameSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface the first human-friendly error
    throw new Error(parsed.error.issues[0]?.message || 'Nombre inválido');
  }
  return parsed.data;
};

export const initialsFromPlayerName = (rawName: string) => {
  const name = validatePlayerName(rawName);
  const parts = name.split(/\s+/).filter(Boolean);
  const chars: string[] = [];

  for (const part of parts) {
    const match = part.match(/[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/);
    if (match?.[0]) chars.push(match[0]);
    if (chars.length >= 2) break;
  }

  const initials = chars.join('').slice(0, 2).toUpperCase();
  if (!initials) throw new Error('Nombre inválido');
  return initials;
};
