// A small "4,812 / 5,000" under a field, shown only once the text reaches
// 80% of its limit, so it never clutters a field in normal use. At the limit
// it turns red and screen readers hear "Character limit reached" once (a
// polite live region that exists from 80% on, so the change is announced;
// the running count itself is not, which would be noisy while typing).

export function CharCount({ length, max, tone = "light" }: { length: number; max: number; tone?: "light" | "dark" }) {
  if (length < max * 0.8) return null;
  const atMax = length >= max;
  const colour = atMax
    ? tone === "dark" ? "font-medium text-danger-on-dark" : "font-medium text-danger"
    : tone === "dark" ? "text-muted-on-dark" : "text-muted";
  return (
    <p className={`mt-1 text-right text-xs tabular-nums ${colour}`}>
      <span aria-hidden="true">
        {length.toLocaleString("en")} / {max.toLocaleString("en")}
      </span>
      <span className="sr-only" aria-live="polite">
        {atMax ? "Character limit reached" : ""}
      </span>
    </p>
  );
}
