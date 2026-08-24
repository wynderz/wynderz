import { applicationsContent } from "@/data/site";

export function WhyWynderz() {
  return (
    <section
      id="capabilities"
      className="section-pad section-atmosphere"
      aria-labelledby="capabilities-heading"
    >
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-kicker justify-center before:content-none">
            {applicationsContent.capabilities.kicker}
          </p>
          <h2
            id="capabilities-heading"
            className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]"
          >
            {applicationsContent.capabilities.heading}
          </h2>
          <div className="accent-rule mx-auto mt-5" aria-hidden />
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {applicationsContent.capabilities.items.map((item) => (
            <li key={item.title} className="surface-card surface-card-hover p-6 sm:p-8">
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-navy">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
