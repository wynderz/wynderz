import { company, contactContent, contactPerson } from "@/data/site";
import { EnquiryForm } from "@/components/EnquiryForm";

export function Contact() {
  return (
    <section id="contact" className="section-pad section-atmosphere-alt" aria-labelledby="contact-heading">
      <div className="container-page grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="section-kicker">{contactContent.kicker}</p>
          <h2 id="contact-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
            {contactContent.heading}
          </h2>
          <div className="accent-rule mt-5" aria-hidden />
          <p className="mt-4 max-w-md text-muted">{contactContent.intro}</p>

          <div className="mt-8 space-y-6">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                {contactContent.labels.person}
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-navy">
                {contactPerson.name} | {contactPerson.title}
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-text-main">
                {contactPerson.about}
              </p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                {contactContent.labels.address}
              </p>
              <p className="mt-2 max-w-md leading-relaxed text-text-main">{company.address}</p>
              <p className="mt-1 text-sm text-muted">{company.plusCode}</p>
              <a
                href={company.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline"
              >
                {contactContent.labels.directions}
              </a>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
                {contactContent.labels.phone}
              </p>
              <a
                href={company.phoneHref}
                className="mt-2 inline-flex font-[family-name:var(--font-display)] text-2xl font-semibold text-navy hover:text-primary"
              >
                {company.phone}
              </a>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
            <iframe
              title="Wynderz location map"
              src={company.mapsEmbed}
              className="h-56 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        <EnquiryForm />
      </div>
    </section>
  );
}
