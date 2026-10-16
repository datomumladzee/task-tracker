// The only file that talks to the backend over HTTP. Pages never call fetch
// themselves: they call the functions in lib/endpoints.ts, which call
// request() here. So the base URL, the token and the error format are each
// handled in exactly one place.

// Set in docker-compose.yml. Read by the browser, so it is the host address.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// the token
// ---------------------------------------------------------------------------
//
// Decision: the access token lives in memory and is mirrored to localStorage.
// Memory alone logs you out on every refresh. localStorage survives refresh,
// at the cost that any script running on this page could read it. React
// escapes text by default, which closes the usual way such a script gets in,
// and the token expires in 30 minutes. An httpOnly cookie would hide it from
// scripts entirely, but the backend reads `Authorization: Bearer`, and
// changing that is out of scope for now.
//
// Only the access token is stored. The pending 2FA token and the TOTP secret
// stay in component state and disappear with the page.

const STORAGE_KEY = "access_token";
let token: string | null = null;
let loaded = false;

function readStorage(): string | null {
  // localStorage can throw (private windows, blocked storage) and does not
  // exist during the server render. Either way: act logged out.
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (!loaded && typeof window !== "undefined") {
    token = readStorage();
    loaded = true;
  }
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  loaded = true;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the token still works for this page, just not after a refresh.
  }
}

// Called when the backend rejects our token, so the auth context can log out
// and send the user to /login. Set once by lib/auth.tsx.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

// FastAPI sends `detail` in three shapes, and this turns each into one line a
// person can read:
//   "Incorrect email or password"                      our own HTTPException
//   {"message": "...", "text": "...", ...}             intake errors with extras
//   [{"loc": ["body", "email"], "msg": "..."}, ...]    Pydantic validation (422)
function messageFrom(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d?.loc) ? d.loc.filter((p: unknown) => p !== "body").join(".") : "";
        return field ? `${field}: ${d?.msg}` : String(d?.msg ?? "invalid input");
      })
      .join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  // No detail at all: usually an unhandled server error, whose body is plain
  // text rather than JSON.
  if (status >= 500) return `The server had a problem (${status}). Try again in a moment.`;
  return `Request failed (${status})`;
}

// Keeps the status code and the raw detail, because some callers need more
// than the message: intake reads detail.text back into the box after a 503,
// and detail.candidates after a 422 on confirm.
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
    // Seconds from the Retry-After header, set on 429s.
    public retryAfter: number | null = null,
  ) {
    super(messageFrom(detail, status));
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// the request
// ---------------------------------------------------------------------------

type Options = {
  body?: unknown;
  // Login and register run before there is a token, and a stale one must not
  // be sent along with them.
  auth?: boolean;
};

export async function request<T>(method: string, path: string, options: Options = {}): Promise<T> {
  const { body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const current = auth ? getToken() : null;
  if (current) headers["Authorization"] = `Bearer ${current}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only throws when no response arrived at all: backend down, wrong
    // URL, or a CORS refusal. Status 0 marks "never reached the server".
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  // 204 No Content has no body to parse.
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    // The backend marks "this token is no good" (expired, user deleted or
    // disabled) with WWW-Authenticate: Bearer. Other 401s, like a wrong
    // password at login, come without it and must not log anyone out.
    const tokenRejected = response.status === 401 && response.headers.has("WWW-Authenticate");
    if (tokenRejected && current) {
      setToken(null);
      onUnauthorized?.();
    }
    const retry = Number(response.headers.get("Retry-After"));
    throw new ApiError(response.status, data?.detail ?? null, Number.isFinite(retry) && retry > 0 ? retry : null);
  }

  return data as T;
}
