"use client";

// The "⋯" button on a board's title row: Edit project and Delete project,
// admin only. Rare actions, so they sit behind one button instead of taking
// the most visible spot on a page people visit to work on tasks.

import { dangerMenuItemClass, menuCardClass, menuItemClass, useMenu } from "@/lib/useMenu";

export const PROJECT_ACTIONS_BUTTON_ID = "project-actions-button";

// Each is optional: an item is left out when the caller's role may not do it.
type Props = {
  onEdit?: () => void;
  onDelete?: () => void;
};

export function ProjectActionsMenu({ onEdit, onDelete }: Props) {
  const { open, close, wrapRef, buttonRef, menuRef, menuId, onButtonClick, onButtonKeyDown, onMenuKeyDown } = useMenu();

  // Choosing an item closes the menu first; the page then opens its panel,
  // which takes focus itself.
  const pick = (action: () => void) => () => {
    close(false);
    action();
  };

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
        id={PROJECT_ACTIONS_BUTTON_ID}
        aria-label="Project actions"
        className="flex h-9 w-9 items-center justify-center rounded border border-line bg-card text-ink hover:border-navy"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Project actions"
          onKeyDown={onMenuKeyDown}
          className={`${menuCardClass} w-48`}
        >
          {onEdit && (
            <button role="menuitem" tabIndex={-1} type="button" onClick={pick(onEdit)} className={menuItemClass}>
              Edit project
            </button>
          )}
          {/* Red, so the destructive one is never mistaken for the other. */}
          {onDelete && (
            <button role="menuitem" tabIndex={-1} type="button" onClick={pick(onDelete)} className={dangerMenuItemClass}>
              Delete project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
