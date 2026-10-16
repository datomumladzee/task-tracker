// Shows an error message, or nothing. role="alert" makes screen readers
// announce it when it appears.

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded bg-red-50 px-2 py-1.5 text-sm text-red-800">
      {message}
    </p>
  );
}
