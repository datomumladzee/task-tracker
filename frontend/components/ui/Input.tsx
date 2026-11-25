"use client";

// A labelled text input, linked to its label by id and htmlFor. (It used to
// wrap the input in the label, but the Show button below must sit inside the
// field without becoming part of the field's name, so it cannot be in the
// label.)
//
// tone="dark" is for the auth pages' dark card. Light is the default, so
// every other form in the app is unchanged.
//
// error shows a message under the field. aria-invalid and aria-describedby
// make screen readers read the message together with the field, and the red
// border means the error is not carried by the text alone.
//
// A type="password" field gets an eye button: an eye to show the password,
// an eye with a slash to hide it again. It stays a real password field until
// pressed. The icon has no text, so the aria-label is the button's name.

import { useId, useState } from "react";

// size replaces the native <input size>, a character width nobody uses here.
// lg matches a size="lg" Button: 46px tall. Dark fields are lg by default.
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  tone?: "light" | "dark";
  size?: "md" | "lg";
  error?: string;
};

const sizes = {
  md: "px-2 py-1.5",
  lg: "px-3 py-2.5 text-base",
};

const looks = {
  light: {
    label: "text-ink",
    // placeholder:text-muted: Tailwind's default (text at 50%) is about 3.2:1
    // on white; muted is about 5.5:1.
    field: "bg-card placeholder:text-muted focus:border-navy",
    border: "border-line",
    bad: "border-danger",
    message: "text-danger",
    // Navy, not lime: lime on white is about 1.15:1 and would vanish.
    reveal: "text-muted hover:text-navy focus-visible:text-navy",
  },
  dark: {
    label: "text-on-dark",
    field: "bg-field-on-dark text-on-dark placeholder:text-muted-on-dark focus:border-lime",
    border: "border-field-line-on-dark",
    bad: "border-danger-on-dark",
    message: "text-danger-on-dark",
    reveal: "text-muted-on-dark hover:text-lime focus-visible:text-lime",
  },
};

export function Input({ label, tone = "light", size, error, className = "", id, type, ...props }: Props) {
  const look = looks[tone];
  const padding = sizes[size ?? (tone === "dark" ? "lg" : "md")];
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const messageId = `${autoId}-message`;

  const revealable = type === "password";
  const [shown, setShown] = useState(false);

  return (
    <div className="text-sm">
      <label htmlFor={inputId} className={`mb-1 block font-medium ${look.label}`}>
        {label}
      </label>
      <div className="relative">
        {/* No outline-none: the focus ring shows on focus (navy on light,
            lime inside AuthCard). pr-11 keeps typed text clear of the eye. */}
        <input
          id={inputId}
          type={revealable && shown ? "text" : type}
          className={`w-full rounded border ${padding} ${look.field} ${error ? look.bad : look.border} ${revealable ? "pr-11" : ""} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-controls={inputId}
            aria-label={shown ? "Hide password" : "Show password"}
            className={`absolute inset-y-0 right-0 flex items-center rounded px-3 ${look.reveal}`}
          >
            <EyeIcon slashed={shown} />
          </button>
        )}
      </div>
      {error && (
        <p id={messageId} className={`mt-1 text-xs ${look.message}`}>
          {error}
        </p>
      )}
    </div>
  );
}

// Drawn in currentColor, so the button's text colour (muted, lime on hover
// and focus) colours the icon. aria-hidden: the button's label says it all.
function EyeIcon({ slashed }: { slashed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {slashed && <path d="M4 4l16 16" />}
    </svg>
  );
}
