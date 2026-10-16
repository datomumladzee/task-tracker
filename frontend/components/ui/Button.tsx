// One button style for the whole app, so pages do not repeat Tailwind classes.

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const look =
    variant === "primary"
      ? "bg-zinc-900 text-white hover:bg-zinc-700"
      : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100";
  return (
    <button
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}
