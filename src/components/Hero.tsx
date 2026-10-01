"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { company, heroSlides, homeContent } from "@/data/site";

const INTERVAL_MS = 4000;
const PORTFOLIO_PDF = "/documents/WYNDERZ_Filament_Winding_Systems_Portfolio.pdf";
const PORTFOLIO_FILENAME = "WYNDERZ_Filament_Winding_Systems_Portfolio.pdf";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 11.5 3.5 3.5 3.5-3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 18h14" />
    </svg>
  );
}

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

          <div className="reveal-delay-2 mt-9 flex w-full max-w-xl flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <Link
                href="/#carousel"
                aria-label="Explore Products"
                className="btn btn-primary h-auto min-h-[2.85rem] w-full px-2 py-2.5 text-center text-[0.58rem] leading-[1.15] tracking-[0.08em] min-[375px]:text-[0.62rem] min-[375px]:tracking-[0.09em] sm:px-4 sm:text-[0.72rem] sm:tracking-[0.1em]"
              >
                <span className="flex flex-col items-center justify-center leading-[1.15] sm:hidden" aria-hidden>
                  <span>Explore</span>
                  <span>Products</span>
                </span>
                <span className="hidden sm:inline" aria-hidden>
                  Explore Products
                </span>
              </Link>
              <a
                href={PORTFOLIO_PDF}
                download={PORTFOLIO_FILENAME}
                className="btn btn-ghost-light h-auto min-h-[2.85rem] w-full gap-1.5 px-2 py-2.5 text-center text-[0.58rem] leading-[1.15] tracking-[0.08em] min-[375px]:text-[0.62rem] min-[375px]:tracking-[0.09em] sm:px-4 sm:text-[0.72rem] sm:tracking-[0.1em]"
                aria-label="Download WYNDERZ catalogue PDF"
              >
                <DownloadIcon className="hidden h-3.5 w-3.5 shrink-0 min-[390px]:block sm:h-4 sm:w-4" />
                <span className="flex flex-col items-center justify-center leading-[1.15] sm:hidden" aria-hidden>
                  <span>Download</span>
                  <span>Catalogue</span>
                </span>
                <span className="hidden sm:inline" aria-hidden>
                  Download Catalogue
                </span>
              </a>
            </div>
            <Link href="/#contact" className="btn btn-ghost-light w-full">
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
