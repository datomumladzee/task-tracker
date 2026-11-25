"use client";

// The frame of every signed-in page: a navy sidebar on the left, a navy top
// bar across the content with the account avatar at its right, and the page
// itself below the bar.
//
// From 768px up the sidebar is fixed on the left, 256px wide. A toggle at
// its top folds it to a 64px icon rail and back; the choice is remembered in this browser
// (lib/sidebarPref.ts) and the width animates, with the content's left
// padding following so nothing jumps. In the rail, link names become
// tooltips on hover and on keyboard focus, and stay as hidden text for
// screen readers.
//
// Below 768px there is no fixed sidebar. The top bar gets a menu button and
// the logo, and the button slides the full sidebar in from the left. Escape,
// the backdrop, the close button or following a link closes it, focus goes
// back to the menu button, and while closed it is inert.

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { setSidebarCollapsed, useSidebarCollapsed } from "@/lib/sidebarPref";

const links = [
  { href: "/projects", label: "Projects", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { href: "/my-tasks", label: "My tasks", icon: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" },
  {
    href: "/my-tasks?view=calendar",
    label: "Calendar",
    icon: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  },
];

// Pinned to the bottom of the sidebar, below the free space.
const bottomLinks = [
  {
    href: "/settings",
    label: "Settings",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  },
];

// The global focus ring is navy and would vanish on navy, so focus inside
// navy areas is white.
const onNavy = "bg-navy text-white [&_:focus-visible]:outline-white";

type NavProps = { collapsed: boolean; onNavigate?: () => void };

// My tasks and Calendar are one page, /my-tasks, with ?view=calendar for the
// calendar, so which of the two is current depends on the address's query.
// useSearchParams needs a Suspense boundary (Next renders the whole route in
// the browser otherwise), so Nav wraps it, and the fallback is the same nav
// with no query known: for that first instant My tasks counts as current.
function Nav(props: NavProps) {
  return (
    <Suspense fallback={<NavLinks {...props} view={null} />}>
      <NavWithView {...props} />
    </Suspense>
  );
}

function NavWithView(props: NavProps) {
  return <NavLinks {...props} view={useSearchParams().get("view")} />;
}

function NavLinks({ collapsed, onNavigate, view }: NavProps & { view: string | null }) {
  const pathname = usePathname();
  const onCalendar = pathname === "/my-tasks" && view === "calendar";

  function item({ href, label, icon }: (typeof links)[number]) {
    // /projects/45 counts as Projects. My tasks and Calendar split
    // /my-tasks by its ?view.
    const current =
      href === "/my-tasks?view=calendar"
        ? onCalendar
        : href === "/my-tasks"
          ? pathname === "/my-tasks" && !onCalendar
          : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <li key={href} className="group relative">
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={current ? "page" : undefined}
          // Current: lime fill, navy text (12.6:1). Others: light text on
          // navy with a faint hover. whitespace-nowrap so a label never wraps
          // while the width animates. 17px text, 24px icons, 48px tall.
          className={`flex items-center gap-3 rounded-lg py-3 text-[17px] leading-6 font-medium whitespace-nowrap ${
            collapsed ? "justify-center px-0" : "px-3"
          } ${current ? "bg-lime text-navy" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icon} />
          </svg>
          {/* In the rail the name stays for screen readers only. */}
          <span className={collapsed ? "sr-only" : ""}>{label}</span>
        </Link>
        {collapsed && (
          // The tooltip: on hover, and on keyboard focus of the link.
          // aria-hidden, since the link already has the name.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
          >
            {label}
          </span>
        )}
      </li>
    );
  }

  // One nav, filling the rest of the sidebar's height: the main links at the
  // top, Settings pushed to the bottom by mt-auto, free space between.
  return (
    <nav aria-label="Main" className="mt-10 flex flex-1 flex-col">
      <ul className="space-y-3">{links.map(item)}</ul>
      <ul className="mt-auto space-y-3 border-t border-white/10 pt-3">{bottomLinks.map(item)}</ul>
    </nav>
  );
}

function Chevron({ left }: { left: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSidebarCollapsed();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  function closeDrawer() {
    setOpen(false);
    menuButton.current?.focus();
  }

  // While the drawer is open: Escape closes it, and focus starts inside it.
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a, button")?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const toggle = (
    <button
      type="button"
      onClick={() => setSidebarCollapsed(!collapsed)}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      aria-controls="desktop-sidebar"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
    >
      <Chevron left={!collapsed} />
    </button>
  );

  return (
    <>
      {/* Desktop sidebar. z-10 so the task panel (z-20) still covers it.
          Expanded it clips while it grows, so labels never spill over the
          page; collapsed it does not, so the tooltips can stick out. */}
      <aside
        id="desktop-sidebar"
        aria-label="Sidebar"
        className={`${onNavy} fixed inset-y-0 left-0 z-10 hidden flex-col py-4 motion-safe:transition-[width] motion-safe:duration-200 md:flex ${
          collapsed ? "w-16 px-2" : "w-64 overflow-hidden px-3"
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <Link href="/projects" aria-label="Task Tracker, projects" className="rounded-md">
              <Logo markOnly size="lg" />
            </Link>
            {toggle}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Link href="/projects" className="min-w-0 rounded-md px-1 py-1">
              <Logo size="lg" />
            </Link>
            {toggle}
          </div>
        )}
        <Nav collapsed={collapsed} />
      </aside>

      {/* Phone drawer and its backdrop. Always the full sidebar. */}
      <div
        aria-hidden="true"
        onClick={closeDrawer}
        className={`fixed inset-0 z-40 bg-ink/40 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"} motion-safe:transition-opacity`}
      />
      <div
        ref={drawer}
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={`${onNavy} fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col px-3 py-4 md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        } motion-safe:transition-transform`}
      >
        <div className="flex items-center justify-between gap-2">
          <Link href="/projects" onClick={() => setOpen(false)} className="rounded-md px-1 py-1">
            <Logo size="lg" />
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <Nav collapsed={false} onNavigate={() => setOpen(false)} />
      </div>

      {/* Everything right of the sidebar. The padding follows its width. */}
      <div className={`motion-safe:transition-[padding] motion-safe:duration-200 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>
        {/* The top bar: empty on desktop except the avatar at the right; on
            phones also the menu button and the logo. z-10 like the sidebar,
            under the task panel. */}
        <header className={`${onNavy} sticky top-0 z-10 flex h-14 items-center gap-3 px-4 sm:px-6`}>
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="mobile-sidebar"
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Link href="/projects" className="rounded-md md:hidden">
            <Logo />
          </Link>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </>
  );
}
