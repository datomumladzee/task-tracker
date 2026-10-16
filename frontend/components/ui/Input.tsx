// A labelled text input. The label wraps the input, so clicking it focuses
// the field without needing matching id and htmlFor attributes.

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, className = "", ...props }: Props) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      <input
        className={`w-full rounded border border-zinc-300 bg-white px-2 py-1.5 outline-none focus:border-zinc-900 ${className}`}
        {...props}
      />
    </label>
  );
}
