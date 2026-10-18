export function bail(message: string): never {
  throw new Error(message);
}

/**
 * Render an unknown thrown value as a single message string.
 *
 * Errors thrown inside the script's vm context come from a different realm,
 * so `err instanceof Error` is false for them; duck-type instead.
 */
export function describeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }

  return String(err);
}
