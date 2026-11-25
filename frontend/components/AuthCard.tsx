import { Logo } from "./Logo";

// The frame for login, register and the 2FA step: a navy gradient with one
// dark card in the middle. Visual only; the pages own their forms.
//
// The gradient is deeper than the card's navy, so the card reads as raised.
// Children render on a dark surface, so they use the *-on-dark tokens and
// tone="dark" on Input and ErrorText.

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function AuthCard({ title, subtitle, children }: Props) {
  return (
    // min-h-dvh, not min-h-screen: on phones the browser bar changes the
    // height, and dvh follows it. px-4 is the 16px margin below 640px.
    // The global focus ring is navy and would vanish here, so everything
    // focused inside gets a lime one, about 11.8:1 on the card.
    <main className="flex min-h-dvh items-center justify-center bg-linear-to-br from-night-top via-night-mid to-night-end px-4 py-8 text-on-dark [&_:focus-visible]:outline-lime">
      <div className="w-full space-y-6 rounded-xl border border-line-on-dark bg-surface-on-dark p-6 shadow-2xl shadow-black/40 sm:max-w-[400px] sm:p-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        {/* Logo and title centred; the form below stays left-aligned. */}
        <div className="space-y-1 text-center">
          <h1 className="font-brand text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-on-dark">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
