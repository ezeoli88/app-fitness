/** Cola de escrituras por conexión. Una falla no bloquea las que siguen. */
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let depth = 0;

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (depth > 0) return task();
    const run = tail.catch(() => undefined).then(async () => {
      depth += 1;
      try {
        return await task();
      } finally {
        depth -= 1;
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };
}
