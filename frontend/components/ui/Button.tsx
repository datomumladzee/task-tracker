// One button style for the whole app, so pages do not repeat Tailwind classes.
//
//   primary    lime fill, navy text. The one main action on a screen, or an AI
//              action. Use at most one per screen, or lime stops meaning much.
//   secondary  navy outline. Everything else that is a real button.
//   danger     red outline. Starts something destructive; ConfirmButton asks
//              before it happens.
//   quiet      text only. Cancel, Back, Close.

type Variant = "primary" | "secondary" | "danger" | "quiet";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const looks: Record<Variant, string> = {
  primary: "bg-lime text-navy hover:bg-lime-hover",
  secondary: "border border-navy bg-card text-navy hover:bg-navy/5",
  danger: "border border-danger bg-card text-danger hover:bg-danger-bg",
  quiet: "text-muted hover:text-navy",
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${looks[variant]} ${className}`}
      {...props}
    />
  );
}
