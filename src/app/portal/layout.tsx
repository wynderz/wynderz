import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./portal.css";

export const metadata: Metadata = {
  title: { default: "Portal", template: "%s · Portal | WYNDERZ" },
  robots: { index: false, follow: false, nocache: true },
};

export default function PortalRootLayout({ children }: { children: ReactNode }) {
  return <div className="pt-app">{children}</div>;
}
