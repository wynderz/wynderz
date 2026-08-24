export const CONTENT_SECTIONS = [
  "home",
  "about",
  "products",
  "applications",
  "videos",
  "contact",
  "global",
] as const;

export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export const CONTENT_FILES: Record<ContentSection, string> = {
  home: "content/home.json",
  about: "content/about.json",
  products: "content/products.json",
  applications: "content/applications.json",
  videos: "content/videos.json",
  contact: "content/contact.json",
  global: "content/global.json",
};

export const COMMIT_TITLES: Record<ContentSection, string> = {
  home: "Admin: update Home content",
  about: "Admin: update About section",
  products: "Admin: update Products content",
  applications: "Admin: update Applications section",
  videos: "Admin: update Videos content",
  contact: "Admin: update Contact section",
  global: "Admin: update Navigation, footer, and site settings",
};

export const SECTION_LABELS: Record<ContentSection, string> = {
  home: "Home",
  about: "About",
  products: "Products",
  applications: "Applications",
  videos: "Videos",
  contact: "Contact",
  global: "Navigation & Settings",
};

export const PREVIEW_PATHS: Record<ContentSection, string> = {
  home: "/",
  about: "/about",
  products: "/products",
  applications: "/#applications",
  videos: "/#videos",
  contact: "/#contact",
  global: "/",
};

export function isContentSection(value: string): value is ContentSection {
  return (CONTENT_SECTIONS as readonly string[]).includes(value);
}

export const MAX_JSON_BYTES = 400_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_SAVE = 12;
export const ALLOWED_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "svg"] as const;
export const IMAGE_UPLOAD_PREFIX = "public/images/uploads/";
export const PUBLIC_IMAGE_PREFIX = "public/images/";
