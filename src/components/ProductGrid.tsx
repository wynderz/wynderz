import Image from "next/image";
import Link from "next/link";
import { company, homeContent, productCategories, productsContent } from "@/data/site";

export function ProductGrid() {
  return (
    <section id="products" className="section-pad section-atmosphere" aria-labelledby="products-heading">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-kicker justify-center before:content-none">
            {homeContent.productsSection.kicker}
          </p>
          <h2 id="products-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
            {homeContent.productsSection.heading}
          </h2>
          <div className="accent-rule mx-auto mt-5" aria-hidden />
          <p className="mt-4 text-muted">{homeContent.productsSection.description}</p>
        </div>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {productCategories.map((category) => (
            <li key={category.id}>
              <article className="surface-card surface-card-hover group flex h-full flex-col overflow-hidden transition">
                <div className="relative aspect-[16/11] overflow-hidden bg-surface-low">
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="img-zoom object-contain p-6"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-navy">
                    {category.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{category.summary}</p>
                  <p className="mt-3 text-sm text-text-main">{category.items[0]}</p>
                  <div className="mt-auto flex flex-wrap gap-3 pt-6">
                    <a
                      href={category.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      {productsContent.viewProduct}
                    </a>
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
            </li>
          ))}
        </ul>

        <div className="mt-12 flex justify-center">
          <Link href="/products" className="btn btn-secondary">
            {homeContent.productsSection.viewAllCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
