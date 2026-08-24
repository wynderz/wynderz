import Link from "next/link";
import { SECTION_LABELS, CONTENT_SECTIONS } from "@/lib/admin/config";
import { company } from "@/data/site";

const DESCRIPTIONS: Record<string, string> = {
  home: "Hero, gallery, featured machinery, and homepage copy",
  about: "About page headings and images",
  products: "Catalogue products, photos, and category cards",
  applications: "Applications and capabilities sections",
  videos: "YouTube links and thumbnail images",
  contact: "Contact headings and leadership details",
  global: "Navigation, footer, logo, and social links",
};

export default function AdminDashboardPage() {
  return (
    <div className="admin-panel">
      <h1 className="admin-title">Dashboard</h1>
      <p className="admin-lead">
        Signed in to the {company.shortName} content manager. Edit any section and click{" "}
        <strong>Save</strong>. When you are ready, open <strong>Publish</strong> to send every saved
        section to GitHub in one commit. Vercel then rebuilds the public site.
      </p>
      <div className="admin-dash-grid">
        {CONTENT_SECTIONS.map((section) => (
          <Link key={section} href={`/admin/${section}`}>
            <strong>{SECTION_LABELS[section]}</strong>
            <span>{DESCRIPTIONS[section]}</span>
          </Link>
        ))}
        <Link href="/admin/publish">
          <strong>Publish</strong>
          <span>Send every saved section live in one go</span>
        </Link>
      </div>
      <div className="admin-card">
        <h2>How publishing works</h2>
        <p className="admin-lead" style={{ margin: 0 }}>
          Save on each section stores work in this browser. Publish sends every saved section to GitHub
          in one commit. Vercel then deploys. The live site updates after that deployment finishes.
        </p>
      </div>
    </div>
  );
}
