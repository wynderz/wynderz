"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  company,
  galleryNavItems,
  headerContent,
  navLinks,
  type NavDropdownItem,
  type NavIcon,
  type NavLink,
} from "@/data/site";
import { ThemeToggle } from "@/components/ThemeToggle";

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-2.5 w-2.5 shrink-0 opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path fill="currentColor" d="M2.1 4.2 6 8.1l3.9-3.9.9.9L6 9.9 1.2 5.1z" />
    </svg>
  );
}

function NavItemIcon({ icon }: { icon: NavIcon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-[1.15rem] w-[1.15rem]",
    "aria-hidden": true as const,
  };

  switch (icon) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
        </svg>
      );
    case "machines":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M7 10h4M7 14h6M15 10h2" />
        </svg>
      );
    case "trust":
      return (
        <svg {...common}>
          <path d="M12 3 4.5 6.5v5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5v-5L12 3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "company":
      return (
        <svg {...common}>
          <path d="M4 21V7l8-4 8 4v14" />
          <path d="M9 21v-6h6v6M9 10h.01M12 10h.01M15 10h.01M9 14h.01M12 14h.01M15 14h.01" />
        </svg>
      );
    case "leadership":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
        </svg>
      );
    case "credentials":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "gallery":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="m21 16-4.5-4.5L8 20" />
        </svg>
      );
    case "images":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="m21 15-5-5-8 8" />
        </svg>
      );
    case "videos":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3z" />
        </svg>
      );
    case "winding":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16M8 12h8" />
        </svg>
      );
    case "pipe":
      return (
        <svg {...common}>
          <path d="M4 9h16v6H4z" />
          <path d="M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case "spindle":
      return (
        <svg {...common}>
          <circle cx="7" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="17" cy="12" r="2.2" />
          <path d="M4 7h16M4 17h16" />
        </svg>
      );
    case "composite":
      return (
        <svg {...common}>
          <path d="M12 3 4 8v8l8 5 8-5V8l-8-5z" />
          <path d="M12 12 4 8M12 12l8-4M12 12v9" />
        </svg>
      );
    case "cnc":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h10M4 17h16" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      );
    case "range":
      return (
        <svg {...common}>
          <path d="M4 6h7v12H4zM13 6h7v5h-7zM13 13h7v5h-7z" />
        </svg>
      );
    case "factory":
      return (
        <svg {...common}>
          <path d="M3 21V10l6 4V10l6 4V7h6v14z" />
        </svg>
      );
    case "handshake":
      return (
        <svg {...common}>
          <path d="M8 13 4.5 9.5 8 6l3 3 5-5 3.5 3.5-8.5 8.5z" />
          <path d="m11 16 2 2 7-7" />
        </svg>
      );
    case "quote":
      return (
        <svg {...common}>
          <path d="M7 8h10v9H9l-2 3V8z" />
          <path d="M10 12h4M10 15h3" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M7 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5L16 12l4 1.5V17a2 2 0 0 1-2 2A14 14 0 0 1 5 5a2 2 0 0 1 2-2z" />
        </svg>
      );
  }
}

function MegaMenuItem({
  item,
  onNavigate,
}: {
  item: NavDropdownItem;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#eef3f8]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f0fa] text-[#1e3a5f]">
        <NavItemIcon icon={item.icon} />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[0.95rem] font-semibold leading-tight text-[#0f1b2d]">
          {item.label}
        </span>
        <span className="mt-0.5 block text-[0.8rem] leading-snug text-[#6b7789]">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

function MegaMenuPanel({
  link,
  onNavigate,
}: {
  link: NavLink;
  onNavigate?: () => void;
}) {
  const isGallery = Boolean(link.gallery);

  return (
    <div className="min-w-[19rem] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.22)] ring-1 ring-black/5">
      {isGallery ? (
        <div className="group/gallery relative">
          <Link
            href={link.items[0]?.href || "/#gallery"}
            onClick={onNavigate}
            className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors group-hover/gallery:bg-[#eef3f8]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f0fa] text-[#1e3a5f]">
              <NavItemIcon icon="gallery" />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex items-center justify-between gap-3">
                <span className="block text-[0.95rem] font-semibold leading-tight text-[#0f1b2d]">
                  {link.items[0]?.label ?? "Gallery"}
                </span>
                <svg viewBox="0 0 12 12" className="h-3 w-3 text-[#6b7789]" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M4.2 2.1 8.1 6l-3.9 3.9.9.9L9.9 6 5.1 1.2z"
                  />
                </svg>
              </span>
              <span className="mt-0.5 block text-[0.8rem] leading-snug text-[#6b7789]">
                {link.items[0]?.description ?? "Browse product images and machine videos"}
              </span>
            </span>
          </Link>

          <div className="invisible absolute left-[calc(100%+0.4rem)] top-0 z-50 opacity-0 transition duration-150 group-hover/gallery:visible group-hover/gallery:opacity-100">
            <div className="min-w-[17.5rem] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.22)] ring-1 ring-black/5">
              {galleryNavItems.map((item) => (
                <MegaMenuItem key={item.label} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        </div>
      ) : link.items.length > 0 ? (
        <ul>
          {link.items.map((item) => (
            <li key={`${link.label}-${item.label}`}>
              <MegaMenuItem item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-3 text-sm text-[#6b7789]">
          Content for this section will be added soon.
        </p>
      )}

      {link.footerLabel ? (
        <div className="mt-1 border-t border-[#e8edf3] px-3 pt-2 pb-1">
          <Link
            href={link.href}
            onClick={onNavigate}
            className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-[#2f6fed] hover:underline"
          >
            {link.footerLabel}
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <path fill="currentColor" d="M4.2 2.1 8.1 6l-3.9 3.9.9.9L9.9 6 5.1 1.2z" />
            </svg>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DesktopDropdown({ link }: { link: NavLink }) {
  return (
    <div className="group relative">
      <Link
        href={link.href}
        className="inline-flex items-center gap-1.5 rounded-t-xl px-3 py-2 text-[0.9rem] font-semibold text-white/78 transition-colors group-hover:bg-[#2a3444] group-hover:text-white group-focus-within:bg-[#2a3444] group-focus-within:text-white"
      >
        {link.label}
        <span className="group-hover:[&>svg]:rotate-180 group-focus-within:[&>svg]:rotate-180">
          <Chevron />
        </span>
      </Link>

      <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <MegaMenuPanel link={link} />
      </div>
    </div>
  );
}

function MobileNavItem({
  link,
  onNavigate,
}: {
  link: NavLink;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const isGallery = Boolean(link.gallery);

  return (
    <div className="border-b border-white/10">
      <div className="flex items-center gap-2">
        <Link
          href={link.href}
          onClick={onNavigate}
          className="flex-1 py-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-white"
        >
          {link.label}
        </Link>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${link.label} menu`}
          onClick={() => setExpanded((value) => !value)}
        >
          <Chevron open={expanded} />
        </button>
      </div>

      {expanded && (
        <div id={panelId} className="pb-5">
          <div className="rounded-2xl bg-white p-2 text-[#0f1b2d]">
            {isGallery ? (
              <div>
                <Link
                  href={link.items[0]?.href || "/#gallery"}
                  onClick={onNavigate}
                  className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#eef3f8]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f0fa] text-[#1e3a5f]">
                    <NavItemIcon icon="gallery" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="text-[0.95rem] font-semibold">
                      {link.items[0]?.label ?? "Gallery"}
                    </span>
                    <span className="mt-0.5 block text-[0.8rem] text-[#6b7789]">
                      {link.items[0]?.description ?? "Browse product images and machine videos"}
                    </span>
                  </span>
                </Link>
                <div className="mt-1 border-t border-[#e8edf3] pt-1">
                  {galleryNavItems.map((item) => (
                    <MegaMenuItem key={item.label} item={item} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            ) : (
              <ul>
                {link.items.map((item) => (
                  <li key={`${link.label}-${item.label}`}>
                    <MegaMenuItem item={item} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            )}

            {link.footerLabel ? (
              <div className="mt-1 border-t border-[#e8edf3] px-3 pt-2 pb-1">
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-[#2f6fed]"
                >
                  {link.footerLabel}
                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M4.2 2.1 8.1 6l-3.9 3.9.9.9L9.9 6 5.1 1.2z"
                    />
                  </svg>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-brand text-white transition-[box-shadow] duration-300 ${
        scrolled ? "shadow-[0_8px_24px_rgba(0,0,0,0.28)]" : ""
      }`}
    >
      <div className="flex h-[4.75rem] w-full items-center gap-3 px-4 md:h-[5.25rem] md:px-6 lg:px-8">
        <Link
          href="/#home"
          className="relative z-10 mr-auto flex shrink-0 items-center gap-3"
          onClick={close}
        >
          <Image
            src={company.logo}
            alt=""
            width={120}
            height={120}
            className="h-12 w-12 bg-white object-contain md:h-14 md:w-14"
            priority
          />
          <span className="font-[family-name:var(--font-display)] text-[0.95rem] font-bold uppercase leading-tight tracking-[0.04em] text-white sm:text-[1.1rem] md:text-[1.2rem]">
            {company.shortName}{" "}
            <span className="font-medium normal-case tracking-[0.02em] text-white/85">
              {headerContent.legalSuffix}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <DesktopDropdown key={link.href + link.label} link={link} />
          ))}
        </nav>

        <div className="hidden items-center gap-3 xl:flex">
          <ThemeToggle />
          <Link href="/#contact" className="btn btn-primary">
            {headerContent.enquireLabel}
          </Link>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <ThemeToggle />
          <Link
            href="/#contact"
            className="btn btn-primary px-3 py-2 text-[0.65rem]"
            onClick={close}
          >
            {headerContent.enquireLabel}
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/20"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="flex w-4 flex-col gap-1" aria-hidden>
              <span
                className={`h-0.5 w-full bg-white transition-transform ${open ? "translate-y-1.5 rotate-45" : ""}`}
              />
              <span
                className={`h-0.5 w-full bg-white transition-opacity ${open ? "opacity-0" : ""}`}
              />
              <span
                className={`h-0.5 w-full bg-white transition-transform ${open ? "-translate-y-1.5 -rotate-45" : ""}`}
              />
            </span>
          </button>
        </div>
      </div>

      <div
        id={menuId}
        className={`xl:hidden ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} fixed inset-0 top-[4.75rem] overflow-y-auto bg-brand/98 transition-opacity md:top-[5.25rem]`}
      >
        <nav className="flex flex-col px-4 py-6 md:px-6" aria-label="Mobile">
          {navLinks.map((link) => (
            <MobileNavItem key={link.href + link.label} link={link} onNavigate={close} />
          ))}
        </nav>
      </div>
    </header>
  );
}
