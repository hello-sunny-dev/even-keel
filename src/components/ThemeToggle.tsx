"use client";

import { useSyncExternalStore } from "react";

type Choice = "light" | "dark" | "system";

const KEY = "ek-theme";
const EVENT = "ek-theme-change";
const ORDER: Choice[] = ["system", "light", "dark"];
const LABEL: Record<Choice, string> = { system: "Auto", light: "Light", dark: "Dark" };

function read(): Choice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  } catch {
    // Private browsing, or storage turned off.
    return "system";
  }
}

/**
 * The stored choice is state that lives outside React — in localStorage, and
 * on the document element — so it is read through `useSyncExternalStore`
 * rather than copied into component state by an effect. The server has no way
 * to know what this browser chose, which is what `getServerSnapshot` is for:
 * it renders "Auto", and the client corrects it on hydration without a
 * mismatch.
 */
function subscribe(onChange: () => void): () => void {
  // `storage` fires in other tabs; the custom event covers this one.
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as Choice);

  function change(next: Choice) {
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this page; it just is not remembered.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <fieldset className="border-rule inline-flex rounded-full border p-0.5">
      <legend className="sr-only">Appearance</legend>
      {ORDER.map((option) => {
        const active = option === choice;
        return (
          <label
            key={option}
            className="cursor-pointer rounded-full px-3 py-1 text-xs"
            style={{
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--muted)",
            }}
          >
            <input
              type="radio"
              name="appearance"
              className="sr-only"
              checked={active}
              onChange={() => change(option)}
            />
            {LABEL[option]}
          </label>
        );
      })}
    </fieldset>
  );
}
