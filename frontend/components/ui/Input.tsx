// A labelled text input. The label wraps the input, so clicking it focuses
// the field without needing matching id and htmlFor attributes.

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, className = "", ...props }: Props) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {/* No outline-none: the global navy focus ring shows on focus. */}
      <input
        className={`w-full rounded border border-line bg-card px-2 py-1.5 focus:border-navy ${className}`}
        {...props}
      />
    </label>
  );
}
