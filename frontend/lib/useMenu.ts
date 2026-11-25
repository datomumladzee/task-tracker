"use client";

// The behaviour of a dropdown menu behind a button, shared by the avatar menu
// in the header and the "⋯" project actions menu. Follows the WAI-ARIA menu
// button pattern:
//   Enter, Space, Arrow Down  open and focus the first item
//   Arrow Up                  open and focus the last item
//   Arrow keys, Home, End     move between items while open
//   Escape                    close and return focus to the button
//   Tab                       close and carry on through the page
// A click anywhere outside also closes it.
//
// The component destructures what it needs: wrapRef on the wrapper,
// buttonRef plus onButtonClick and onButtonKeyDown on the button, menuRef,
// menuId and onMenuKeyDown on the menu, and role="menuitem" on each item.
// (Separate values, not one object: React's lint rules treat an object that
// holds refs as a ref, and refuse any read of it during render.)

import { useEffect, useId, useRef, useState } from "react";

export function useMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Only items that are showing: an item can be hidden at some widths (My
  // tasks in the avatar menu is phones only), and a hidden one cannot take
  // focus, which would leave the arrow keys stuck.
  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter((el) => el.getClientRects().length > 0);

  function openAt(which: "first" | "last") {
    setOpen(true);
    // The items exist only after this render, so focus them on the next frame.
    requestAnimationFrame(() => {
      const list = items();
      (which === "first" ? list[0] : list[list.length - 1])?.focus();
    });
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // Click outside closes. pointerdown rather than click, so the menu is gone
  // before whatever was clicked reacts.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openAt("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt("last");
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") setOpen(false);
  }

  const onButtonClick = () => (open ? close(false) : openAt("first"));

  return { open, close, wrapRef, buttonRef, menuRef, menuId, onButtonClick, onButtonKeyDown, onMenuKeyDown };
}

// Menu item look on the white menu card. Items get a navy fill when focused
// instead of the focus ring, which is white inside the header and would
// vanish on the white menu.
// Two full class lists rather than one plus overrides: two text colours on one
// element are decided by CSS order, not by the order of the classes.
const menuItemBase = "block w-full px-4 py-2 text-left text-sm outline-none focus-visible:text-white";
export const menuItemClass = `${menuItemBase} text-ink hover:bg-page focus-visible:bg-navy`;
// Red for a destructive item, with a red focus fill (white on it is 6.5:1).
export const dangerMenuItemClass = `${menuItemBase} text-danger hover:bg-danger-bg focus-visible:bg-danger`;

export const menuCardClass = "absolute top-full right-0 z-30 mt-2 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg";
