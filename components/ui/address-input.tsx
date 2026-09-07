"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import {
  suggestAddressesAction,
  type AddressSuggestion,
} from "@/server/actions/places";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * An address field that suggests, but never insists.
 *
 * Typing is always allowed and always accepted. Autocomplete is a convenience
 * layered on top: rural addresses, new builds and apartment numbers are all
 * things Google routinely doesn't know, and a field that refuses what somebody
 * knows to be their own address is worse than one that never helped.
 *
 * Degrades silently. No key configured, quota exhausted, Google slow or
 * down — all of them end the same way, as a plain text input, because the
 * player filling in a registration form can do nothing about any of them.
 */
export function AddressInput({
  id,
  value,
  onChange,
  placeholder = "Street, city, province, postal code",
  disabled = false,
  available = true,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** False when no key is configured, so we never show an empty dropdown. */
  available?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // One token per address being entered, so a burst of keystrokes bills as a
  // single session rather than one per letter.
  const session = useRef(Math.random().toString(36).slice(2));
  const box = useRef<HTMLDivElement>(null);
  // What the last request was for, so a slow reply can't overwrite a newer one.
  const latest = useRef("");

  useEffect(() => {
    if (!available || disabled) return;
    const query = value.trim();
    if (query.length < 4) {
      setSuggestions([]);
      return;
    }

    // Wait for a pause in typing. Every call costs, and mid-word fragments
    // produce suggestions nobody wants anyway.
    latest.current = query;
    const timer = setTimeout(async () => {
      const res = await suggestAddressesAction({
        query,
        sessionToken: session.current,
      });
      if (latest.current !== query) return;
      if ("suggestions" in res) {
        setSuggestions(res.suggestions);
        setOpen(res.suggestions.length > 0);
        setActive(-1);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [value, available, disabled]);

  // Clicking away closes it; the typed text stays exactly as typed.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(s: AddressSuggestion) {
    onChange(s.text);
    setOpen(false);
    setSuggestions([]);
    // A new session: the next thing typed is a different address.
    session.current = Math.random().toString(36).slice(2);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        /*
          Two dropdowns over one field is worse than either alone: the
          browser's own address list opens on top of ours, and the one
          underneath is the one that knows about this league's region.
          So we ask for the browser's help only when we have none of our
          own — where it is the entire fallback and genuinely useful.
        */
        autoComplete={available ? "off" : "street-address"}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="border-rule bg-surface absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                  i === active ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
