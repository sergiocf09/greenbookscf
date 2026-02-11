/**
 * Parse a date-only string (YYYY-MM-DD) as a LOCAL date, not UTC.
 * 
 * `new Date("2025-02-10")` is interpreted as UTC midnight, which in timezones
 * behind UTC (e.g., Mexico UTC-6) displays as the previous day.
 * 
 * This helper appends T12:00:00 to force midday interpretation,
 * ensuring the correct date regardless of timezone.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  // If it's already a full ISO string with time component, use as-is
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // For date-only strings (YYYY-MM-DD), parse as local midday
  return new Date(`${dateStr}T12:00:00`);
}
