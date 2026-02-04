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

/**
 * Format a player name to Title Case for consistent display.
 * E.g., "JUAN PÉREZ" -> "Juan Pérez", "maria garcia" -> "Maria Garcia"
 */
export const formatPlayerName = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Format a player name as "FirstName L." (first name + last initial).
 * E.g., "JUAN PÉREZ" -> "Juan P.", "maria garcia" -> "Maria G."
 * If only one name, returns just that name.
 */
export const formatPlayerNameShort = (name: string): string => {
  if (!name) return '';
  const parts = name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  
  if (parts.length === 0) return '';
  
  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  
  if (parts.length === 1) {
    return firstName;
  }
  
  // Get initial of second part (last name)
  const lastInitial = parts[1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
};

/**
 * Format a player name as "FirstName SecondName" (first two words only).
 * E.g., "JUAN PÉREZ LÓPEZ" -> "Juan Pérez", "maria garcia hernandez" -> "Maria Garcia"
 * If only one name, returns just that name.
 */
export const formatPlayerNameTwoWords = (name: string): string => {
  if (!name) return '';
  const parts = name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  
  if (parts.length === 0) return '';
  
  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  
  if (parts.length === 1) {
    return firstName;
  }
  
  const secondName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  return `${firstName} ${secondName}`;
};
