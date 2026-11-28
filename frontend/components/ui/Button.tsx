// One button style for the whole app, so pages do not repeat Tailwind classes.
//
//   primary    lime fill, navy text. The one main action on a screen, or an AI
//              action. Use at most one per screen, or lime stops meaning much.
//   secondary  navy outline. Everything else that is a real button.
//   danger     red outline. Starts something destructive; ConfirmButton asks
//              before it happens.
//   quiet      text only. Cancel, Back, Close.
//
// size="lg" matches the large inputs on the sign-in, sign-up and 2FA pages.
// tone="dark" is for those pages' navy card: a disabled button there turns
// gray-navy with muted text. Half-transparent lime over navy looks olive.

type Variant = "primary" | "secondary" | "danger" | "quiet" | "cta";

type Size = "md" | "lg" | "xl";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  tone?: "light" | "dark";
};

const looks: Record<Variant, string> = {
  // The transparent border gives primary the same 1px edges as secondary,
  // so the two are the same height side by side.
  primary: "border border-transparent bg-lime font-medium text-navy hover:bg-lime-hover",
  secondary: "border border-navy bg-card font-medium text-navy hover:bg-navy/5",
  danger: "border border-danger bg-card font-medium text-danger hover:bg-danger-bg",
  quiet: "font-medium text-muted hover:text-navy",
  // The page's main call to action (New project). The lime never changes
  // colour; hover and press are movement and light instead. Hover: a 2px
  // lift and a bigger glow (and, via "group", a quarter turn of the plus
  // icon the page puts inside). Press: shrinks to 98% with a tighter glow,
  // so it feels pushed in. Movement is skipped for reduced motion; the glow
  // still changes. The glow is a darker lime, since pure lime barely shows
  // on the near-white page.
  cta: "group border border-transparent bg-lime font-semibold text-navy shadow-[0_8px_22px_-8px_rgb(132_160_0/0.75)] transition-[translate,scale,box-shadow] duration-150 hover:shadow-[0_14px_30px_-8px_rgb(132_160_0/0.9)] motion-safe:hover:-translate-y-0.5 active:shadow-[0_4px_12px_-6px_rgb(132_160_0/0.7)] motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  md: "px-3 py-1.5 text-sm",
  lg: "px-4 py-2.5 text-base",
  xl: "px-8 py-[18px] text-[17px]",
};

// disabled: comes after hover: in Tailwind's order, so these also beat the
// hover colour while the button is disabled.
const disabledLooks = {
  light: "disabled:opacity-50",
  dark: "disabled:bg-white/10 disabled:text-muted-on-dark",
};

export function Button({ variant = "primary", size = "md", tone = "light", className = "", ...props }: Props) {
  return (
    <button
      className={`rounded disabled:cursor-not-allowed ${disabledLooks[tone]} ${sizes[size]} ${looks[variant]} ${className}`}
      {...props}
    />
  );
}
