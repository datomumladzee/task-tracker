// Our own form checks, so the browser's grey popup never shows: forms that use
// these set noValidate, which turns the browser's check off.
//
// Each check returns a message, or null when the value is fine. The limits
// match the backend's UserCreate, which still has the final say: anything
// these miss comes back as an API error, shown above the submit button.

import { useState } from "react";

// --- the rules ---------------------------------------------------------------

export function checkEmail(value: string): string | null {
  if (!value) return "Enter your email";
  if (value.length > 320) return "Use at most 320 characters";
  // Deliberately loose: something@something.something. The backend's
  // EmailStr is the real test.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email, like you@example.com";
  return null;
}

// Logging in: any length. An old account's password is whatever it is.
export function checkLoginPassword(value: string): string | null {
  return value ? null : "Enter your password";
}

// Registering: 8 to 128, as UserCreate requires.
export function checkNewPassword(value: string): string | null {
  if (!value) return "Choose a password";
  if (value.length < 8) return "Use at least 8 characters";
  if (value.length > 128) return "Use at most 128 characters";
  return null;
}

// Stricter than the backend on one point: a name of only spaces is refused.
export function checkName(value: string): string | null {
  if (!value.trim()) return "Enter your name";
  if (value.length > 255) return "Use at most 255 characters";
  return null;
}

// --- showing them ------------------------------------------------------------

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

// Keeps one message per field.
//   validateAll  on submit: check every field, show every message, focus the
//                first bad field. Returns true when the form may be sent.
//   recheck      while typing: only a field already showing a message is
//                checked again, so fixing it clears the message at once,
//                but an untouched field never complains early.
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<FieldErrors<K>>({});

  // `checks` lists the fields in the order they appear on the page, which is
  // the order focus should try them. Each input needs a matching name.
  function validateAll(form: HTMLFormElement, checks: Record<K, string | null>): boolean {
    const next: FieldErrors<K> = {};
    for (const key of Object.keys(checks) as K[]) {
      const message = checks[key];
      if (message) next[key] = message;
    }
    setErrors(next);

    const first = (Object.keys(checks) as K[]).find((key) => next[key]);
    if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
    return first === undefined;
  }

  function recheck(key: K, message: string | null) {
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  return { errors, validateAll, recheck };
}
