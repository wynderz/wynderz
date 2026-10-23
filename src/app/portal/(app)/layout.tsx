import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Shell } from "@/components/portal/Shell";
import { FY_COOKIE, getYears, requirePortal } from "@/lib/portal/page";

export const dynamic = "force-dynamic";

export default async function PortalAppLayout({ children }: { children: ReactNode }) {
  const { session } = await requirePortal();
  const years = await getYears();
  const raw = (await cookies()).get(FY_COOKIE)?.value;
  const selected = raw && raw !== "all" && years.some((y) => String(y.id) === raw) ? Number(raw) : null;
  return (
    <Shell user={{ name: session.user.name, email: session.user.email }} years={years.map((y) => ({ id: y.id, label: y.label, status: y.status }))} selectedFy={selected}>
      {children}
    </Shell>
  );
}
