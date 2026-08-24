"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { company, heroSlides, homeContent } from "@/data/site";

const INTERVAL_MS = 4000;

export function Hero() {
  const slides = heroSlides;
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduceMotion || slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, slides.length]);

  return (
    <section
      id="home"
      className="relative flex min-h-[88vh] items-end overflow-hidden bg-brand md:min-h-[92vh] md:items-center"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0" aria-hidden>
        {slides.map((slide, slideIndex) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              slideIndex === index ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={slide.image}
              alt=""
              fill
              priority={slideIndex === 0}
              sizes="100vw"
              className="object-cover object-[70%_center] scale-[1.02] md:object-center"
            />
          </div>
        ))}
        {/* Keep machinery visible; text side readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-brand/78 via-brand/45 to-brand/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand/70 via-transparent to-brand/25" />
      </div>

      <div className="container-page relative z-10 w-full py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="reveal section-kicker text-primary-fixed">
            {company.city} · Est. {company.established}
          </p>
          <h1
            id="hero-heading"
            className="reveal-delay mt-5 font-[family-name:var(--font-display)] text-[clamp(2.1rem,5.6vw,4.4rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white"
          >
            {homeContent.hero.heading}
          </h1>
          <p className="reveal-delay-2 mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            {homeContent.hero.description}
          </p>
          <div className="reveal-delay-2 mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/#carousel" className="btn btn-primary">
              {homeContent.hero.primaryCta}
            </Link>
            <Link href="/#contact" className="btn btn-ghost-light">
              {homeContent.hero.secondaryCta}
            </Link>
          </div>

          <div className="mt-8 flex gap-2" role="tablist" aria-label="Hero background images">
            {slides.map((slide, dotIndex) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={`Show ${slide.name}`}
                className={`h-1.5 rounded-sm transition-all ${
                  dotIndex === index
                    ? "w-8 bg-primary-container"
                    : "w-1.5 bg-white/35 hover:bg-white/60"
                }`}
                onClick={() => setIndex(dotIndex)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
