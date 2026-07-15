/** Error thrown by provider adapters for normalized model runtime failures. */
export class AIError extends Error {
  readonly cause?: unknown;
  readonly provider?: string;

  constructor(message: string, options?: { provider?: string; cause?: unknown }) {
    super(message);
    this.name = "AIError";
    this.provider = options?.provider;
    this.cause = options?.cause;
  }
}
