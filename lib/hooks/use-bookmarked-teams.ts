"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = (competitionId: string) => `vb:bookmarks:${competitionId}`;

/**
 * Client-only bookmarks for a public competition — no account needed. A viewer
 * can star their team so it's pinned and its schedule is one tap away. Persisted
 * in localStorage per competition; read after mount to avoid an SSR mismatch.
 */
export function useBookmarkedTeams(competitionId: string) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(competitionId));
      setIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setIds([]);
    }
  }, [competitionId]);

  const toggle = useCallback(
    (teamId: string) => {
      setIds((cur) => {
        const next = cur.includes(teamId)
          ? cur.filter((x) => x !== teamId)
          : [...cur, teamId];
        try {
          localStorage.setItem(storageKey(competitionId), JSON.stringify(next));
        } catch {
          // ignore storage failures (private mode, quota) — bookmarks are a
          // convenience, not critical state.
        }
        return next;
      });
    },
    [competitionId],
  );

  return { bookmarked: ids, toggle };
}
