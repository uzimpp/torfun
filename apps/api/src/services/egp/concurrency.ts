export interface Limiter {
  /** Run `call` once a place is free; the place is given back however it ends. */
  run<T>(call: () => Promise<T>): Promise<T>;
  /** Take a place and hold it until the returned function is called (once counts). */
  acquire(): Promise<() => void>;
  /**
   * Take a place only if one is free now, without waiting: null if none is, or
   * if anyone is already waiting (they asked first).
   */
  tryAcquire(): (() => void) | null;
}

/**
 * At most `size` holders at once, across every caller that shares it. Waiters
 * are served in the order they asked.
 */
export function createLimiter(size: number): Limiter {
  let held = 0;
  const waiting: Array<() => void> = [];

  const releaser = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting.shift();
      if (next) next();
      else held -= 1;
    };
  };

  const acquire = async (): Promise<() => void> => {
    if (held < size) held += 1;
    // The place is handed over by the releaser, so `held` is not touched here.
    else await new Promise<void>((resolve) => waiting.push(resolve));
    return releaser();
  };

  return {
    acquire,
    tryAcquire() {
      if (held >= size || waiting.length > 0) return null;
      held += 1;
      return releaser();
    },
    async run(call) {
      const release = await acquire();
      try {
        return await call();
      } finally {
        release();
      }
    },
  };
}
