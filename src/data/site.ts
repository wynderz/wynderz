import globalContent from "../../content/global.json";
import homeContentJson from "../../content/home.json";
import aboutContentJson from "../../content/about.json";
import productsContentJson from "../../content/products.json";
import applicationsContentJson from "../../content/applications.json";
import contactContentJson from "../../content/contact.json";

export type NavIcon =
  | "home"
  | "machines"
  | "trust"
  | "company"
  | "leadership"
  | "credentials"
  | "gallery"
  | "images"
  | "videos"
  | "winding"
  | "pipe"
  | "spindle"
  | "composite"
  | "cnc"
  | "range"
  | "factory"
  | "handshake"
  | "quote"
  | "map"
  | "phone";

export type NavDropdownItem = {
  label: string;
  href: string;
  description: string;
  icon: NavIcon;
};

export type NavLink = {
  label: string;
  href: string;
  items: readonly NavDropdownItem[];
  gallery?: boolean;
  footerLabel?: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  image: string;
  sourceUrl: string;
  href: string;
  summary: string;
};

function toTelHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

export const homeContent = homeContentJson;
export const aboutContent = aboutContentJson;
export const productsContent = productsContentJson;
export const applicationsContent = applicationsContentJson;
export const contactContent = contactContentJson;

export const company = {
  ...globalContent.company,
  phoneHref: toTelHref(globalContent.company.phone),
  favicon: "/images/brand/favicon.ico",
};

export const headerContent = globalContent.header;

export const heroSlides = homeContent.hero.slides;

export const socialLinks = globalContent.socialLinks;

export const contactPerson = contactContent.person;

export const navLinks: readonly NavLink[] = globalContent.navLinks as NavLink[];

export const galleryNavItems: readonly NavDropdownItem[] =
  globalContent.galleryNavItems as NavDropdownItem[];

export const allProducts: Product[] = productsContent.items
  .filter((product) => !("isActive" in product) || product.isActive !== false)
  .map((product) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  image: product.image,
  sourceUrl: product.sourceUrl,
  href: `/products/${product.id}`,
  summary: product.summary,
}));

export const carouselProducts: Product[] = productsContent.items
  .filter((product) => product.inCarousel && (!("isActive" in product) || product.isActive !== false))
  .map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    image: product.image,
    sourceUrl: product.sourceUrl,
    href: `/products/${product.id}`,
    summary: product.summary,
  }));

export const featuredProducts = carouselProducts;

export const productCategories = productsContent.categories;

export const applications = applicationsContent.items.filter(
  (item) => !("isActive" in item) || (item as { isActive?: boolean }).isActive !== false,
);

export const whyWynderz = applicationsContent.capabilities.items;

export const trustHighlights = [
  { label: "Established", value: company.established },
  { label: "Employees", value: company.employeesShort },
  { label: "GST No.", value: company.gst },
  { label: "IEC", value: company.iec },
] as const;

export const galleryImages = [
  ...homeContent.gallery.images.filter((image) => !("isActive" in image) || image.isActive !== false),
  ...carouselProducts.map((product) => ({
    id: product.id,
    src: product.image,
    alt: product.name,
    href: product.href,
  })),
];

export function getProductById(id: string) {
  return allProducts.find((product) => product.id === id);
}
