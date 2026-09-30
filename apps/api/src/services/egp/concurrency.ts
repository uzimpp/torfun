/**
 * Apply `work` to every item with at most `limit` running at once, returning
 * the results in the order of the input.
 *
 * Order matters to the caller: the results feed `assignDocumentRoles`, whose
 * tie-breaks depend on the order documents arrive in, so a pool that returned
 * them in completion order would change which TOR wins.
 *
 * A worker takes the next unclaimed index, so no item is started twice and no
 * more than `limit` are in flight. The first failure rejects the whole call.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
