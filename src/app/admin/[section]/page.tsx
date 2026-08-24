import { notFound } from "next/navigation";
import { EditorForm } from "@/components/admin/EditorForm";
import { CONTENT_SECTIONS, SECTION_LABELS, isContentSection } from "@/lib/admin/config";

const DESCRIPTIONS: Record<string, string> = {
  home: "Edit homepage copy, hero slides, featured images, and gallery. Add, reorder, or remove gallery images.",
  about: "Edit the About page headings, descriptions, and images.",
  products: "Add, edit, reorder, hide, or delete catalogue products and category cards.",
  applications: "Add, edit, reorder, or remove Applications and Our Capabilities items.",
  videos: "Add YouTube videos. Store a thumbnail image here; the video itself stays on YouTube.",
  contact: "Edit contact section headings and the published contact person details.",
  global: "Navigation labels and URLs, footer/company facts, logo, hours, and social profile URLs.",
};

type PageProps = {
  params: Promise<{ section: string }>;
};

export function generateStaticParams() {
  return CONTENT_SECTIONS.map((section) => ({ section }));
}

export default async function AdminSectionPage({ params }: PageProps) {
  const { section } = await params;
  if (!isContentSection(section)) notFound();

  return (
    <EditorForm
      section={section}
      description={DESCRIPTIONS[section] || `Edit ${SECTION_LABELS[section]} content.`}
    />
  );
}
