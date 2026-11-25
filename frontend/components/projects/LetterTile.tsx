// A project's first letter on one of four navy shades. id modulo 4 picks the
// shade, so a project keeps its colour across visits, renames and pages.
// White on the lightest shade is 5.7:1.

const shades = ["bg-tile-1", "bg-tile-2", "bg-tile-3", "bg-tile-4"];

// The project's shade as a background class, for anything that should match
// its tile, like the accent strip on a project card.
export function tileShade(id: number): string {
  return shades[id % shades.length];
}

const sizes = {
  md: "h-10 w-10 rounded-lg text-lg",
  sm: "h-6 w-6 rounded-md text-xs",
  xs: "h-4 w-4 rounded text-[10px]",
};

export function LetterTile({ id, name, size = "md" }: { id: number; name: string; size?: keyof typeof sizes }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-brand font-semibold text-white ${sizes[size]} ${tileShade(id)}`}
    >
      {letter}
    </span>
  );
}
