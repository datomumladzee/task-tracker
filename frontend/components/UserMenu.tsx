"use client";

// The avatar in the header and its menu: who is signed in, Settings, and
// Sign out. The keyboard and click-outside behaviour lives in useMenu.

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { menuCardClass, menuItemClass, useMenu } from "@/lib/useMenu";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { open, close, wrapRef, buttonRef, menuRef, menuId, onButtonClick, onButtonKeyDown, onMenuKeyDown } = useMenu();

  if (!user) return null;
  const initial = (user.full_name.trim() || user.email).charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={onButtonClick}
        onKeyDown={onButtonKeyDown}
        aria-label={`Account menu for ${user.full_name}`}
        // Lime fill with a navy letter: 12.6:1, and the lime circle stands
        // out on the navy bar.
        className="flex h-9 w-9 items-center justify-center rounded-full bg-lime font-brand text-sm font-semibold text-navy hover:bg-lime-hover"
      >
        {initial}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className={`${menuCardClass} w-64`}
        >
          {/* Who is signed in. Not a menu item: there is nothing to do with it. */}
          <div role="none" className="border-b border-line px-4 py-3">
            <p className="truncate font-medium text-ink">{user.full_name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          {/* Phones only: there the header hides its nav links, so this is
              the way to My tasks. On wider screens the nav has it. */}
          <Link role="menuitem" tabIndex={-1} href="/my-tasks" onClick={() => close(false)} className={`${menuItemClass} sm:hidden`}>
            My tasks
          </Link>
          <Link role="menuitem" tabIndex={-1} href="/settings" onClick={() => close(false)} className={menuItemClass}>
            Settings
          </Link>
          <button role="menuitem" tabIndex={-1} type="button" onClick={signOut} className={menuItemClass}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
