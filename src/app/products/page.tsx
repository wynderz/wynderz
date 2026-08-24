import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EnquiryCTA } from "@/components/EnquiryCTA";
import { allProducts, company, productsContent } from "@/data/site";

export const metadata: Metadata = {
  title: "Products | WYNDERZ Pvt. Ltd.",
  description:
    "Winding Machine, Filament Winder, Multi Spindle Winding Machine, Hydraulic Extractor and 5 Spindle Winding Machine from WYNDERZ Pvt. Ltd.",
};

export default function ProductsPage() {
  return (
    <>
      <Header />
      <main>
        <section className="border-b border-border/60 section-atmosphere-alt py-16 md:py-20">
          <div className="container-page">
            <p className="section-kicker">{productsContent.kicker}</p>
            <h1 className="display-title mt-3 text-[clamp(2rem,4.5vw,3.5rem)]">
              {productsContent.heading}
            </h1>
            <div className="accent-rule mt-5" aria-hidden />
            <p className="mt-4 max-w-2xl text-muted">{productsContent.description}</p>
          </div>
        </section>

        <section className="section-pad section-atmosphere">
          <div className="container-page grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {allProducts.map((product) => (
              <article key={product.id} className="surface-card surface-card-hover flex flex-col overflow-hidden">
                <Link href={product.href} className="relative aspect-[5/4] bg-surface-low">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-contain p-6"
                  />
                </Link>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">
                    {product.category}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-navy">
                    <Link href={product.href}>{product.name}</Link>
                  </h2>
                  <p className="mt-2 text-sm text-muted">{product.summary}</p>
                  <div className="mt-auto flex flex-wrap gap-3 pt-5">
                    <Link href={product.href} className="btn btn-primary">
                      {productsContent.viewProduct}
                    </Link>
                    <a
                      href={company.enquiryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                    >
                      {productsContent.enquireNow}
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <EnquiryCTA />
      </main>
      <Footer />
    </>
  );
}
