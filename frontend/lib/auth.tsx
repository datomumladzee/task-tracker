"use client";

// Who is logged in, shared with every page through React context.
//
// The token itself lives in lib/api.ts. This file only knows whether there is
// a user: on load it asks /users/me with the stored token, so a deleted or
// disabled account is noticed on the first page, not on the first click.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, setToken, setUnauthorizedHandler } from "./api";
import { me } from "./endpoints";
import type { User } from "./types";

type Status = "loading" | "in" | "out";

type AuthValue = {
  status: Status;
  user: User | null;
  // Called with an access token once login (or its 2FA step) succeeds.
  signIn: (accessToken: string) => Promise<void>;
  signOut: () => void;
  // Replace the stored user with a fresher copy the backend returned, for
  // example from /auth/2fa/verify, without another /users/me request.
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus("out");
    router.push("/login");
  }, [router]);

  const signIn = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    setUser(await me());
    setStatus("in");
  }, []);

  useEffect(() => {
    // Any call that finds the token dead lands here, wherever it was made.
    setUnauthorizedHandler(signOut);

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
  }, [signOut]);

  return <AuthContext.Provider value={{ status, user, signIn, signOut, updateUser: setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
