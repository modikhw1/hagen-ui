export const TEAM_COLORS = [
  '#4f46e5',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

export function cmColorVar(seed: string): string {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = (hash % TEAM_COLORS.length);
  // Vi returnerar en färg-token om den finns, annars bara indexet för en fallback
  return `cm-color-${index + 1}`;
}
