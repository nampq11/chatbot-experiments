/** Creates a stable diagnostic record for provider normalization issues. */
export function createDiagnostic(
  type: string,
  message: string,
  details?: Record<string, unknown>,
): { type: string; message: string; details?: Record<string, unknown> } {
  return details ? { type, message, details } : { type, message };
}
