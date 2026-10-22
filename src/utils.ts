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

export class TimeoutError extends Error {
  constructor(message: string = "Operation timed out") {
    super(message);
  }
}

export function timeout<T>(
  timeoutSeconds: number,
  promise: Promise<T>,
  errorMessage?: string,
): Promise<T> {
  if (timeoutSeconds <= 0)
    return Promise.reject(new TimeoutError(errorMessage));
  if (timeoutSeconds === Infinity) return promise;

  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(errorMessage)),
      timeoutSeconds,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
