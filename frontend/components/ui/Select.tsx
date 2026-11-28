"use client";

// The app's one dropdown, used everywhere instead of the browser's <select>.
//
// It follows the WAI-ARIA "select-only combobox" pattern: a button with
// role="combobox" that keeps focus, and a listbox whose highlighted option
// it points at with aria-activedescendant. Screen readers hear the label,
// "combobox", the chosen value, and each option as the highlight moves.
//
// Keyboard, closed: Down, Up, Enter, Space or Alt+Down open it; typing a
// letter opens it on the first option starting with that letter.
// Keyboard, open: Up and Down move (disabled options are skipped), Home and
// End jump, Page Up and Page Down move ten, Enter, Space or Alt+Up choose,
// Escape and Tab close without changing anything, typing jumps by first
// letters. A click or tap outside closes it.
//
// The list is drawn in a portal with fixed positioning, so no card, panel
// or scrolling box can clip it or paint over it. It opens upward when there
// is no room below, stays inside the screen's width, and follows the button
// when the page scrolls. Inside a dialog (the task panel) the portal goes
// into that dialog, because aria-modal tells screen readers to ignore
// everything outside it.
//
// onChange runs only when the value actually changes, like a <select>.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  // Shown before the label, in the list and on the button when chosen.
  icon?: React.ReactNode;
};

type Size = "sm" | "md" | "lg";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  "aria-label": string;
  // Shown when value matches no option, like "Choose a project...".
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  size?: Size;
  // Stretch the button to its container's width.
  fullWidth?: boolean;
  // Replaces the default colours, border and radius of the button, for a
  // tinted variant such as the status pill on task cards.
  look?: string;
  id?: string;
};

const sizes: Record<Size, string> = {
  sm: "min-h-7 gap-1.5 px-2.5 py-1 text-xs",
  md: "min-h-[34px] gap-2 px-3 py-1.5 text-sm",
  lg: "min-h-[46px] gap-2 px-3 py-2.5 text-base",
};

// The same look as the text fields (ui/field.ts): field-edge border, 8px
// corners, and the navy border and halo on keyboard focus or while open.
const defaultLook =
  "rounded-lg border border-field-edge bg-card text-ink shadow-[0_1px_2px_rgb(16_44_64/0.05)] transition-[border-color,box-shadow] duration-150 hover:border-muted focus-visible:border-navy focus-visible:shadow-[0_0_0_4px_rgb(16_44_64/0.14)] focus-visible:outline-none aria-expanded:border-navy aria-expanded:shadow-[0_0_0_4px_rgb(16_44_64/0.14)] disabled:bg-page disabled:text-muted";

export function Select({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  placeholder = "Choose...",
  disabled = false,
  title,
  size = "md",
  fullWidth = false,
  look,
  id,
}: Props) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [openState, setOpen] = useState(false);
  // A disabled control is never open, even if it was when it got disabled.
  const open = openState && !disabled;
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<React.CSSProperties>({});
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabled = (i: number) => i >= 0 && i < options.length && !options[i].disabled;

  // Move `by` enabled options from `from` (negative is up), skipping
  // disabled ones and stopping at the ends.
  function step(from: number, by: number): number {
    const dir = by > 0 ? 1 : -1;
    let i = from;
    let last = from;
    let moved = 0;
    while (moved < Math.abs(by)) {
      i += dir;
      if (i < 0 || i >= options.length) break;
      if (!options[i].disabled) {
        last = i;
        moved += 1;
      }
    }
    return last;
  }

  const firstEnabled = () => options.findIndex((o) => !o.disabled);
  const lastEnabled = () => {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) return i;
    return -1;
  };

  function openList(at?: number) {
    if (disabled) return;
    const start = at ?? (enabled(selectedIndex) ? selectedIndex : firstEnabled());
    setActive(start);
    setPortalTarget(button.current?.closest('[role="dialog"]') ?? document.body);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function choose(i: number) {
    if (!enabled(i)) return;
    if (options[i].value !== value) onChange(options[i].value);
    close();
  }

  // Typing jumps to the first option, after the current one, whose label
  // starts with what was typed in the last half second.
  function typeAhead(key: string): number | null {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 500 ? typed.current.text + key.toLowerCase() : key.toLowerCase(), at: now };
    const text = typed.current.text;
    const from = Math.max(active, 0);
    const order = [...options.keys()].map((k) => (from + (text.length === 1 ? 1 : 0) + k) % options.length);
    const hit = order.find((i) => enabled(i) && options[i].label.toLowerCase().startsWith(text));
    return hit ?? null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ";
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (printable) {
        const hit = typeAhead(e.key);
        e.preventDefault();
        openList(hit ?? undefined);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (e.altKey) return;
        setActive((a) => step(a, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) return choose(active);
        setActive((a) => step(a, -1));
        return;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled());
        return;
      case "End":
        e.preventDefault();
        setActive(lastEnabled());
        return;
      case "PageDown":
        e.preventDefault();
        setActive((a) => step(a, 10));
        return;
      case "PageUp":
        e.preventDefault();
        setActive((a) => step(a, -10));
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        return;
      case "Escape":
        e.preventDefault();
        close();
        return;
      case "Tab":
        close();
        return;
      default:
        if (printable) {
          const hit = typeAhead(e.key);
          if (hit !== null) setActive(hit);
        }
    }
  }

  // Place the list under the button, or above it when there is no room
  // below, inside the screen's width. Runs on open and while scrolling.
  const place = useCallback(() => {
    const b = button.current?.getBoundingClientRect();
    if (!b) return;
    const listHeight = Math.min(options.length * 38 + 10, 300);
    const below = window.innerHeight - b.bottom;
    const up = below < listHeight + 8 && b.top > below;
    const width = Math.max(b.width, 160);
    const left = Math.min(Math.max(8, b.left), window.innerWidth - width - 8);
    setPosition(
      up
        ? { left, bottom: window.innerHeight - b.top + 4, minWidth: width, maxHeight: Math.min(300, b.top - 12) }
        : { left, top: b.bottom + 4, minWidth: width, maxHeight: Math.min(300, below - 12) },
    );
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Keep the highlighted option in view inside a long list.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (!list.current?.contains(e.relatedTarget as Node)) close();
        }}
        className={`inline-flex items-center text-left font-medium disabled:cursor-not-allowed ${sizes[size]} ${look ?? defaultLook} ${
          fullWidth ? "w-full" : ""
        } ${disabled ? "" : "cursor-pointer"}`}
      >
        {selected?.icon}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "font-normal text-muted"}`}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open &&
        portalTarget &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{ position: "fixed", ...position }}
            className="z-50 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-line bg-card p-1 text-sm shadow-lg"
          >
            {options.map((o, i) => {
              const isSelected = i === selectedIndex;
              const isActive = i === active;
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  // mousedown would move focus off the button; keep it there.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                  onClick={() => choose(i)}
                  // 40px tall, a comfortable target on phones.
                  className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 ${
                    o.disabled ? "cursor-not-allowed text-muted opacity-60" : "cursor-pointer"
                  } ${isActive && !o.disabled ? "bg-navy text-white" : "text-ink"} ${isSelected ? "font-semibold" : ""}`}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 whitespace-nowrap">{o.label}</span>
                  <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 ${isSelected ? "" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-6.5" />
                  </svg>
                </li>
              );
            })}
          </ul>,
          portalTarget,
        )}
    </>
  );
}
