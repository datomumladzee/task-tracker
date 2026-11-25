"use client";

// Who is logged in, shared with every page through React context.
//
// The token itself lives in lib/api.ts. This file only knows whether there is
// a user: on load it asks /users/me with the stored token, so a deleted or
// disabled account is noticed on the first page, not on the first click.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getToken, setToken, setUnauthorizedHandler } from "./api";
import { me } from "./endpoints";
import type { User } from "./types";

type Status = "loading" | "in" | "out";

// Where to go after signing in, carried as /login?next=/projects/45.
// Only a path inside this app is accepted: "//evil.com" or "https://..."
// would turn the sign-in page into a redirect to someone else's site.
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/projects";
  if (raw.startsWith("/login") || raw.startsWith("/register")) return "/projects";
  return raw;
}

export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

type AuthValue = {
  status: Status;
  user: User | null;
  // Called with an access token once login (or its 2FA step) succeeds.
  signIn: (accessToken: string) => Promise<void>;
  signOut: () => void;
  // True after the user chose Sign out, false when the session just ran out.
  // RequireAuth uses it: only an expired session should bring you back to
  // the same page, or the next person to sign in lands on your project.
  signedOutOnPurpose: boolean;
  // Replace the stored user with a fresher copy the backend returned, for
  // example from /auth/2fa/verify, without another /users/me request.
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [signedOutOnPurpose, setSignedOutOnPurpose] = useState(false);

  // No navigation here: RequireAuth sees status "out" and sends the user to
  // the sign-in page, with or without ?next depending on how they left.
  const endSession = useCallback((onPurpose: boolean) => {
    setToken(null);
    setUser(null);
    setSignedOutOnPurpose(onPurpose);
    setStatus("out");
  }, []);

  const signOut = useCallback(() => endSession(true), [endSession]);

  const signIn = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    setUser(await me());
    setSignedOutOnPurpose(false);
    setStatus("in");
  }, []);

  useEffect(() => {
    // Any call that finds the token dead lands here, wherever it was made.
    // Not on purpose, so signing in again returns to the same page.
    setUnauthorizedHandler(() => endSession(false));

    // No stored token: nobody to ask about. Still resolved as a promise, so
    // both paths set state in a callback rather than during the effect.
    const check = getToken() ? me() : Promise.resolve(null);
    check
      .then((u) => {
        setUser(u);
        setStatus(u ? "in" : "out");
      })
      // A 401 already went through signOut above. Anything else (backend
      // down) also leaves us unable to say who this is.
      .catch(() => setStatus("out"));
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut, signedOutOnPurpose, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
