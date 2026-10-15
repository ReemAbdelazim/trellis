"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { TaskPane } from "@/components/task/task-pane";
import { SearchPalette } from "./search-palette";
import { cn } from "@/lib/utils";
import { useLocalFlag } from "@/lib/use-local-storage";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useLocalFlag("trellis-sidebar-collapsed");
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setMobileNav(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => setCollapsed(!collapsed);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className={cn("hidden shrink-0 md:block", collapsed ? "w-0" : "w-60")}>
        {!collapsed && <Sidebar />}
      </div>
      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-pop">
            <Sidebar />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenNav={() => setMobileNav(true)}
          onToggleSidebar={toggleCollapsed}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto scrollbar-thin">{children}</main>
          <Suspense>
            <TaskPane />
          </Suspense>
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
