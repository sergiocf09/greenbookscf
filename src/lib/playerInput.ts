import { z } from 'zod';
import type { Player } from '@/types/golf';

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

/**
 * Given an array of players, detect duplicate initials and disambiguate them
 * by appending the first letter of the next differing name part.
 * Returns a Map of playerId -> disambiguated initials string.
 * 
 * Example:
 *   "Alejandro Serrano Berri" (AS) + "Alejandro Serrano Arriola" (AS)
 *   → "ASB" and "ASA"
 */
export const disambiguateInitials = (players: Player[]): Map<string, string> => {
  const result = new Map<string, string>();
  
  // Group players by their current initials
  const byInitials = new Map<string, Player[]>();
  players.forEach(p => {
    const key = p.initials.toUpperCase();
    const group = byInitials.get(key) || [];
    group.push(p);
    byInitials.set(key, group);
  });
  
  byInitials.forEach((group, initials) => {
    if (group.length <= 1) {
      // No collision
      group.forEach(p => result.set(p.id, p.initials));
      return;
    }
    
    // Collision detected - try to differentiate with additional letter
    group.forEach(p => {
      const parts = p.name.trim().split(/\s+/).filter(Boolean);
      // Current initials use first 2 parts. Try 3rd part first, then deeper letters.
      let extra = '';
      if (parts.length >= 3) {
        // Use first letter of 3rd word (e.g., last name)
        const match = parts[2].match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
        extra = match?.[0]?.toUpperCase() || '';
      } else if (parts.length === 2) {
        // Only 2 words - use 2nd letter of last word
        const word = parts[1];
        if (word.length > 1) {
          extra = word[1].toUpperCase();
        }
      }
      
      result.set(p.id, initials + extra);
    });
    
    // Check if still duplicated after adding extra letter
    const newInitials = new Map<string, Player[]>();
    group.forEach(p => {
      const ni = result.get(p.id) || '';
      const g = newInitials.get(ni) || [];
      g.push(p);
      newInitials.set(ni, g);
    });
    
    // If still duplicated, append incremental number
    newInitials.forEach((subGroup, ni) => {
      if (subGroup.length > 1) {
        subGroup.forEach((p, idx) => {
          result.set(p.id, ni + (idx + 1));
        });
      }
    });
  });
  
  return result;
};

/**
 * Given an array of players, detect duplicate short names (first name only)
 * and disambiguate by appending the first letter of the last name.
 * Returns a Map of playerId -> disambiguated short name.
 * 
 * Example:
 *   "Alejandro Serrano Berri" (Ale) + "Alejandro Serrano Arriola" (Ale)
 *   → "AleB" and "AleA" (if 3rd word differs)
 *   → "Alejandro S." and "Alejandro S." fallback to formatPlayerNameShort
 */
export const disambiguateShortNames = (players: Player[]): Map<string, string> => {
  const result = new Map<string, string>();
  
  // Group by first name (lowercased)
  const byFirstName = new Map<string, Player[]>();
  players.forEach(p => {
    const firstName = formatPlayerName(p.name).split(' ')[0] || '';
    const key = firstName.toLowerCase();
    const group = byFirstName.get(key) || [];
    group.push(p);
    byFirstName.set(key, group);
  });
  
  byFirstName.forEach((group, _key) => {
    if (group.length <= 1) {
      // No collision - use first name only
      group.forEach(p => {
        const firstName = formatPlayerName(p.name).split(' ')[0] || p.name;
        result.set(p.id, firstName);
      });
      return;
    }
    
    // Collision - use formatPlayerNameShort for all
    // Check if formatPlayerNameShort also collides
    const shortNames = new Map<string, Player[]>();
    group.forEach(p => {
      const short = formatPlayerNameShort(p.name);
      const g = shortNames.get(short) || [];
      g.push(p);
      shortNames.set(short, g);
    });
    
    shortNames.forEach((subGroup, shortName) => {
      if (subGroup.length <= 1) {
        subGroup.forEach(p => result.set(p.id, shortName));
      } else {
        // Still colliding - use formatPlayerNameTwoWords
        subGroup.forEach(p => {
          result.set(p.id, formatPlayerNameTwoWords(p.name));
        });
      }
    });
  });
  
  return result;
};
