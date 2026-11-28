// The look of every text field in the app ("clean outlined"), in one place.
// The shared Input, the task panel, the AI draft card, the board's fields,
// the comment box and the dropdown button all use these classes, so fields
// and dropdowns look like one family.
//
//   rest      white, a 1px border in field-edge (about 3.3:1 on white, so the
//             field's edge is easy to find), 8px corners, a hint of shadow,
//             muted placeholder (about 5.5:1)
//   hover     a slightly darker border
//   focus     a navy border and a soft navy halo, in place of the offset
//             outline ring that buttons and links keep
//   disabled  a light grey fill and muted text
//
// Sizes: md is 34px tall (the board's rows and the task panel), lg is 46px
// (the bigger forms and the sign-in card), matching the Button sizes.

export type FieldSize = "md" | "lg";

export const fieldSizes: Record<FieldSize, string> = {
  md: "px-3 py-1.5 text-sm",
  lg: "px-3 py-2.5 text-base",
};

// Shape and motion, shared by light and dark fields.
export const fieldShape =
  "w-full rounded-lg border shadow-[0_1px_2px_rgb(16_44_64/0.05)] transition-[border-color,box-shadow] duration-150 focus-visible:outline-none";

export const fieldHalo = "focus:border-navy focus:shadow-[0_0_0_4px_rgb(16_44_64/0.14)]";

const lightColours = `bg-card text-ink placeholder:text-muted ${fieldHalo} disabled:cursor-not-allowed disabled:bg-page disabled:text-muted`;

// The full class list for a light field. invalid swaps the grey border for
// the error red (and drops the hover change, so the red stays put).
export function fieldClass(size: FieldSize = "md", invalid = false): string {
  return `${fieldShape} ${fieldSizes[size]} ${lightColours} ${invalid ? "border-danger" : "border-field-edge hover:border-muted"}`;
}
