"use client";

// The bar at the top of every signed-in page. The only place solid navy is
// used, so the header reads as the frame and not as content.
//
// One row, everything on the same centre line: logo, nav, then the avatar at
// the far right. On phones the nav is hidden, leaving logo and avatar; the
// logo leads to Projects and the avatar menu holds My tasks and Settings.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";

const links = [
  { href: "/projects", label: "Projects" },
  { href: "/my-tasks", label: "My tasks" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  const pathname = usePathname();
  return (
    // h-14 fixes the bar's height so the nav links can stretch to it and put
    // their underline on the bar's bottom edge. The global focus ring is navy
    // and would vanish here, so focus inside the header is white.
    <header className="flex h-14 items-center gap-6 bg-navy px-4 text-white sm:px-6 [&_:focus-visible]:outline-white">
      <Link href="/projects" className="shrink-0 rounded">
        <Logo />
      </Link>

      <nav aria-label="Main" className="hidden h-full items-stretch gap-6 text-sm sm:flex">
        {links.map(({ href, label }) => {
          // /projects/45 counts as Projects.
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              // A transparent top border balances the bottom one, so the text
              // stays on the bar's centre line. Lime on navy is 12.6:1.
              className={`flex items-center border-y-2 border-t-transparent ${
                current ? "border-b-lime font-medium text-white" : "border-b-transparent text-white/75 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center">
        <UserMenu />
      </div>
    </header>
  );
}
