import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
