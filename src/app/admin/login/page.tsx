import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="admin-login"><p className="admin-lead">Loading…</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
