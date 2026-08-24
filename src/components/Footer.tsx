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
          <a href={company.phoneHref} className="mt-6 inline-flex text-primary-fixed hover:underline">
            {company.phone}
          </a>
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
