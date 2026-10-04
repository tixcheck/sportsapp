/**
 * Read every row a query matches, not just the first page.
 *
 * PostgREST caps a response at 1,000 rows (Supabase's default `max-rows`) and
 * says nothing when it does — the result simply looks complete. BVL Thursday
 * Spiking had 1,851 registration answers; the Players tab read the first
 * 1,000, so players who had answered everything showed "Details missing" and
 * the ask-for-details button offered to email 117 of them (2026-10-04).
 *
 * `page` must build a FRESH query for the given inclusive range, ordered by a
 * unique column — without a stable order, pages can overlap or skip rows.
 * Stops at the first short page. Throws on an error rather than returning a
 * partial list, because a partial list is exactly the bug this exists to fix.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
