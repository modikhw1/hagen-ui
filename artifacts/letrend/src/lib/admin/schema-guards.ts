export function isMissingRelationError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('relation') &&
    message.toLowerCase().includes('does not exist')
  );
}

export function isMissingColumnError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('column') &&
    (message.toLowerCase().includes('does not exist') ||
      message.toLowerCase().includes('could not find'))
  );
}

export function isMissingEnumError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('type') &&
    message.toLowerCase().includes('does not exist')
  );
}
