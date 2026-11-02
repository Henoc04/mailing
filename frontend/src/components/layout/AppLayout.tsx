import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer and start each page at the top on navigation.
  useEffect(() => {
    setMenuOpen(false);
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main-scroll" className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
