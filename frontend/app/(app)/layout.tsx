import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";

// (app) is a route group: the brackets keep it out of the URL. Every page in
// it needs a login and gets the sidebar and top bar, without repeating either
// per page. AppShell is a client component because the sidebar's collapsed
// state lives in the browser; this layout stays a server component.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
