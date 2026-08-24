import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EnquiryCTA } from "@/components/EnquiryCTA";
import { aboutContent, company } from "@/data/site";

export const metadata: Metadata = {
  title: "About Us | WYNDERZ Pvt. Ltd.",
  description: aboutContent.hero.description,
};

export default function AboutPage() {
  const paragraphs = aboutContent.company.paragraphs.filter((paragraph) => paragraph.trim());

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden bg-brand py-20 text-white md:py-28">
          <div className="absolute inset-0 opacity-30">
            <Image
              src={aboutContent.hero.image}
              alt={aboutContent.hero.imageAlt}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-brand/80" />
          </div>
          <div className="container-page relative z-10">
            <p className="section-kicker text-primary-fixed before:bg-primary-fixed">
              {aboutContent.hero.kicker}
            </p>
            <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.2rem,5vw,4rem)] font-bold tracking-tight text-white">
              {aboutContent.hero.heading}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 md:text-lg">
              {aboutContent.hero.description}
            </p>
          </div>
        </section>

        <section className="section-pad section-atmosphere-alt">
          <div className="container-page grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="card-highlight relative aspect-[5/4] overflow-hidden rounded-lg border border-border bg-card">
              <Image
                src={aboutContent.company.image}
                alt={aboutContent.company.imageAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-8"
              />
            </div>
            <div>
              <h2 className="display-title text-[clamp(1.8rem,3.5vw,2.6rem)]">
                {aboutContent.company.heading}
              </h2>
              <div className="accent-rule mt-5" aria-hidden />
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="mt-6 leading-relaxed text-text-main">
                  {paragraph}
                </p>
              ))}
              {aboutContent.company.cta ? (
                <Link href={aboutContent.company.ctaUrl} className="btn btn-primary mt-8">
                  {aboutContent.company.cta}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {aboutContent.leadership.name || aboutContent.leadership.bio ? (
          <section id="leadership" className="section-pad section-atmosphere">
            <div className="container-page max-w-3xl">
              <p className="section-kicker">{aboutContent.leadership.kicker}</p>
              <h2 className="display-title mt-3 text-[clamp(1.8rem,3.5vw,2.6rem)]">
                {aboutContent.leadership.name}
              </h2>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-primary">
                {aboutContent.leadership.title}
              </p>
              <div className="accent-rule mt-5" aria-hidden />
              <p className="mt-6 text-base leading-relaxed text-text-main md:text-lg">
                {aboutContent.leadership.bio}
              </p>
            </div>
          </section>
        ) : null}

        <section className="section-pad section-atmosphere">
          <div className="container-page">
            <h2 className="display-title text-center text-[clamp(1.8rem,3.5vw,2.6rem)]">
              {aboutContent.profile.heading}
            </h2>
            <div className="accent-rule mx-auto mt-5" aria-hidden />
            {aboutContent.profile.highlights.length > 0 ? (
              <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {aboutContent.profile.highlights.map((item) => (
                  <div key={item.label} className="surface-card surface-card-hover p-6 text-center">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                      {item.label}
                    </dt>
                    <dd className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-navy">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {aboutContent.profile.facts.length > 0 ? (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {aboutContent.profile.facts.map((item) => (
                  <div key={item.label} className="surface-card surface-card-hover p-5">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                      {item.label}
                    </dt>
                    <dd className="mt-2 text-sm font-semibold text-navy">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>

        <EnquiryCTA />
      </main>
      <Footer />
    </>
  );
}
