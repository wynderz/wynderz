import { applicationsContent } from "@/data/site";

export function Applications() {
  return (
    <section id="applications" className="section-pad section-atmosphere-deep text-white" aria-labelledby="applications-heading">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="section-kicker text-primary-fixed before:bg-primary-fixed">
            {applicationsContent.kicker}
          </p>
          <h2
            id="applications-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4vw,3rem)] font-semibold tracking-tight text-white"
          >
            {applicationsContent.heading}
          </h2>
          <div className="mt-5 h-[3px] w-11 bg-primary-container" aria-hidden />
          <blockquote className="mt-5 max-w-3xl text-base leading-relaxed text-white/70 sm:text-lg">
            {applicationsContent.quote}
          </blockquote>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {applicationsContent.items.map((item, index) => (
            <li
              key={item.title}
              className="card-highlight-dark rounded-lg bg-white/[0.03] p-6"
            >
              <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-primary-fixed">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
