import Image from "next/image";
import Link from "next/link";
import { carouselProducts, company, homeContent, productsContent } from "@/data/site";

const featured = carouselProducts.slice(0, 4);

export function FeaturedProducts() {
  return (
    <section className="section-pad section-atmosphere-alt" aria-labelledby="featured-heading">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="section-kicker">{homeContent.featured.kicker}</p>
          <h2 id="featured-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
            {homeContent.featured.heading}
          </h2>
          <div className="accent-rule mt-5" aria-hidden />
        </div>

        <div className="mt-14 space-y-16 md:space-y-24">
          {featured.map((product, index) => {
            const reverse = index % 2 === 1;
            return (
              <article
                key={product.id}
                className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
                  reverse ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div className="card-highlight relative aspect-[5/4] overflow-hidden rounded-lg border border-border bg-card">
                  <Image
                    src={index === 0 ? homeContent.featured.spotlightImage : product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className={
                      index === 0
                        ? "object-cover object-center"
                        : "object-contain p-8"
                    }
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {product.category}
                  </p>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight text-navy">
                    {product.name}
                  </h3>
                  <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
                    {product.summary}
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link href={product.href} className="btn btn-primary">
                      View Details
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
