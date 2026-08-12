"use client";

import { useEffect, useRef, useState } from "react";

import {
  searchVenuesAction,
  type PlaceSuggestion,
} from "@/server/actions/places";
import { Input } from "@/components/ui/input";

/**
 * Venue field with address autocomplete.
 *
 * Always a working text input first, suggestions second: the lookup needs a
 * Google Places key, and on a deployment without one `searchVenuesAction`
 * returns nothing. An organizer must always be able to type "Ashbridges Bay"
 * and move on, so nothing here blocks on the network.
 */
export function VenueInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // What we last searched for, so picking a suggestion doesn't immediately
  // re-search for the text we just inserted.
  const lastQuery = useRef<string>("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === lastQuery.current) {
      setSuggestions([]);
      return;
    }

    // Debounced: Places bills per request, and an organizer typing a venue name
    // would otherwise fire one call per keystroke.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchVenuesAction(q);
      if (cancelled) return;
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(s: PlaceSuggestion) {
    lastQuery.current = s.label;
    onChange(s.label);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        placeholder="Ashbridges Bay"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />

      {open && suggestions.length > 0 && (
        <ul className="border-border bg-surface absolute z-20 mt-1 w-full overflow-hidden rounded-lg border shadow-md">
          {suggestions.map((s) => (
            <li key={`${s.label}-${s.detail}`}>
              <button
                type="button"
                onClick={() => choose(s)}
                className="hover:bg-muted block w-full px-3 py-2 text-left"
              >
                <span className="block text-sm font-medium">{s.label}</span>
                {s.detail && (
                  <span className="text-muted-foreground block text-xs">
                    {s.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
