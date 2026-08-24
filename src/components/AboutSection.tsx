import Image from "next/image";
import Link from "next/link";
import { company, homeContent } from "@/data/site";

export function AboutSection() {
  return (
    <section id="about" className="section-pad section-atmosphere-alt" aria-labelledby="about-heading">
      <div className="container-page grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-card card-highlight sm:aspect-[5/4] lg:aspect-[4/5]">
          <Image
            src={homeContent.aboutSection.image}
            alt={homeContent.aboutSection.imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
          />
        </div>

        <div>
          <p className="section-kicker">{homeContent.aboutSection.kicker}</p>
          <h2 id="about-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
            {homeContent.aboutSection.heading}
          </h2>
          <div className="accent-rule mt-5" aria-hidden />
          <p className="mt-6 text-base leading-relaxed text-text-main md:text-lg">
            {homeContent.aboutSection.intro}
          </p>
          <p className="mt-4 text-base leading-relaxed text-muted">
            {homeContent.aboutSection.body}
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="surface-card surface-card-hover p-4">
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                Nature of Business
              </dt>
              <dd className="mt-2 text-sm font-semibold text-navy">{company.natureOfBusiness}</dd>
            </div>
            <div className="surface-card surface-card-hover p-4">
              <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                Additional Business
              </dt>
              <dd className="mt-2 text-sm font-semibold text-navy">{company.additionalBusiness}</dd>
            </div>
          </dl>
          <Link href={homeContent.aboutSection.ctaUrl} className="btn btn-primary mt-8">
            {homeContent.aboutSection.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
