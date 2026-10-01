import Image from "next/image";
import Link from "next/link";
import { company, headerContent, navLinks, productCategories } from "@/data/site";

export function Footer() {
  return (
    <footer className="bg-brand text-white">
      <div className="container-page grid gap-10 py-16 md:grid-cols-[1.35fr_1fr_1fr]">
        <div>
          <Link href="/#home" className="inline-flex items-center gap-3">
            <Image
              src={company.logo}
              alt=""
              width={120}
              height={120}
              className="h-14 w-14 bg-white object-contain"
            />
            <span className="font-[family-name:var(--font-display)] text-xl font-bold uppercase leading-tight tracking-[0.04em]">
              {company.shortName}{" "}
            <span className="font-medium normal-case tracking-[0.02em] text-white/85">
              {headerContent.legalSuffix}
            </span>
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            {company.description}
          </p>
          <p className="mt-4 text-sm text-white/45">
            {company.city} · GST {company.gst}
          </p>
        </div>

        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/45">
            Navigate
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-primary-fixed">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/45">
            Products
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {productCategories.map((category) => (
              <li key={category.id}>
                <a
                  href={category.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-fixed"
                >
                  {category.name}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2">
            <a
              href={company.phoneHref}
              className="inline-flex items-center gap-2 text-primary-fixed hover:underline"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M7 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5L16 12l4 1.5V17a2 2 0 0 1-2 2A14 14 0 0 1 5 5a2 2 0 0 1 2-2z" />
              </svg>
              {company.phone}
            </a>
            <a
              href={company.emailHref}
              className="inline-flex items-center gap-2 text-primary-fixed hover:underline"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              {company.email}
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {company.name}. All rights reserved.</p>
          <a
            href={company.existingSite}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-fixed"
          >
            Official listing: wynderz.in
          </a>
        </div>
      </div>
    </footer>
  );
}
