import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EnquiryCTA } from "@/components/EnquiryCTA";
import { allProducts, company, getProductById, productsContent } from "@/data/site";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return allProducts.map((product) => ({ slug: product.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductById(slug);
  if (!product) return { title: "Product | WYNDERZ Pvt. Ltd." };
  return {
    title: `${product.name} | WYNDERZ Pvt. Ltd.`,
    description: product.summary,
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = getProductById(slug);
  if (!product) notFound();

  const related = allProducts
    .filter((item) => item.category === product.category && item.id !== product.id)
    .slice(0, 3);

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-border/60 section-atmosphere-alt py-10 md:py-14">
          <div className="container-page">
            <nav aria-label="Breadcrumb" className="text-sm text-muted">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/" className="hover:text-primary">
                    Home
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li>
                  <Link href="/products" className="hover:text-primary">
                    Products
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li className="text-navy">{product.name}</li>
              </ol>
            </nav>

            <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-start">
              <div className="card-highlight relative aspect-[5/4] overflow-hidden rounded-lg border border-border bg-card">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-8"
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  {product.category}
                </p>
                <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-navy">
                  {product.name}
                </h1>
                <p className="mt-5 text-base leading-relaxed text-muted md:text-lg">
                  {product.summary}
                </p>

                <div className="mt-8 space-y-4">
                  <div className="surface-card surface-card-hover p-4">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                      Overview
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-text-main">
                      This product is listed in the Wynderz {product.category} range on
                      wynderz.in. For full specifications and commercial details, send an
                      enquiry or view the official listing.
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={company.enquiryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    {productsContent.enquireNow}
                  </a>
                  <a
                    href={product.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    View on wynderz.in
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="section-pad section-atmosphere" aria-labelledby="related-heading">
            <div className="container-page">
              <h2 id="related-heading" className="display-title text-2xl md:text-3xl">
                Related products
              </h2>
              <div className="accent-rule mt-4" aria-hidden />
              <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="surface-card surface-card-hover block overflow-hidden transition">
                      <div className="relative aspect-[5/4] bg-surface-low">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="(max-width: 640px) 100vw, 33vw"
                          className="object-contain p-5"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-navy">
                          {item.name}
                        </h3>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <EnquiryCTA />
      </main>
      <Footer />
    </>
  );
}
