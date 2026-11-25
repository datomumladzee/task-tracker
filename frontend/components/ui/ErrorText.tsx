// Shows an error message, or nothing. role="alert" makes screen readers
// announce it when it appears.
//
// tone="dark" for the auth pages: the light danger red is about 2:1 on the
// dark card, so a lighter red is used there instead.

const looks = {
  light: "bg-danger-bg text-danger",
  dark: "border border-danger-on-dark/30 bg-danger-on-dark/10 text-danger-on-dark",
};

export function ErrorText({ message, tone = "light" }: { message: string | null; tone?: "light" | "dark" }) {
  if (!message) return null;
  return (
    <p role="alert" className={`rounded px-2 py-1.5 text-sm ${looks[tone]}`}>
      {message}
    </p>
  );
}
