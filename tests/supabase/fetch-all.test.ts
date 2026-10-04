import { describe, expect, it } from "vitest";

import { fetchAll } from "@/lib/supabase/fetch-all";

/** A fake table of `n` rows served the way PostgREST serves a range. */
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it("reads past the 1,000-row cap", async () => {
    const t = table(1851);
    const all = await fetchAll(t.page);
    expect(all).toHaveLength(1851);
    expect(all[1850]).toBe(1850);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("one request when it fits; one extra when it lands exactly on a page", async () => {
    expect((await fetchAll(table(10).page)).length).toBe(10);
    const exact = table(1000);
    expect(await fetchAll(exact.page)).toHaveLength(1000);
    expect(exact.calls).toHaveLength(2);
  });

  it("an empty result is an empty list", async () => {
    expect(await fetchAll(table(0).page)).toEqual([]);
  });

  it("throws rather than return a partial list", async () => {
    let n = 0;
    const page = async (from: number, to: number) =>
      n++ === 0
        ? { data: Array.from({ length: to - from + 1 }, () => 1), error: null }
        : { data: null, error: { message: "boom" } };
    await expect(fetchAll(page)).rejects.toThrow("boom");
  });
});
