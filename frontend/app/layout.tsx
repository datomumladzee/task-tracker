import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

// The brand font, for "Task Tracker" and the sign-in card titles only; the
// rest of the app stays in the system font. next/font downloads it at build
// time and serves it from our own origin, so the browser never calls Google.
// It sets the --font-sora variable that font-brand in globals.css points at.
const brand = Sora({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Task Tracker",
  description: "A small Jira with natural-language task intake",
};

// Decision: the whole app renders in the browser. The token lives in
// localStorage, which the server cannot see, so a server render could not
// know who is logged in anyway. Layouts stay server components; everything
// that calls the API is a client component.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={brand.variable}>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
