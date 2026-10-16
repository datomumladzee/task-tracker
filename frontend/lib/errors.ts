// Turns anything a failed call can throw into a message for the page. Every
// expected failure is an ApiError; anything else is our own bug, and the
// generic text says so rather than showing a stack trace.

import { ApiError } from "./api";

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Something went wrong. Check the browser console.";
}
