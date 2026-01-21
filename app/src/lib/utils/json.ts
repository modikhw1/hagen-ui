/**
 * Safe JSON parse with fallback
 * Returns default value if parse fails instead of throwing
 */
export function safeJsonParse<T>(
  jsonString: string | undefined | null,
  defaultValue: T
): T {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error);
    return defaultValue;
  }
}
