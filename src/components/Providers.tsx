"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { SocialRail } from "@/components/SocialRail";
import { HashScroll } from "@/components/HashScroll";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <ThemeProvider>
      <HashScroll />
      {children}
      {isAdmin ? null : <SocialRail />}
    </ThemeProvider>
  );
}
