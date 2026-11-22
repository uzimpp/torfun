/**
 * Escapes every regular-expression metacharacter so user text is matched
 * literally by Mongo's `$regex` (ASVS V1.2.9; threat T-07). One copy, used by
 * every repository that searches by substring, so a fix lands everywhere.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
