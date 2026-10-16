import { AppHeader } from "@/components/AppHeader";
import { RequireAuth } from "@/components/RequireAuth";

// (app) is a route group: the brackets keep it out of the URL. Every page in
// it needs a login and gets the header, without repeating either per page.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireAuth>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </RequireAuth>
  );
}
