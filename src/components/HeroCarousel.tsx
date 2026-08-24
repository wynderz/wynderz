"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { homeContent, type Product } from "@/data/site";

const AUTOPLAY_MS = 3000;

type HeroCarouselProps = {
  products: Product[];
};

export function HeroCarousel({ products }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const regionId = useId();
  const pointerStartX = useRef<number | null>(null);
  const pointerDeltaX = useRef(0);

  const count = products.length;

  const goTo = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, reduceMotion, count]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
    if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX;
    pointerDeltaX.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null) return;
    pointerDeltaX.current = event.clientX - pointerStartX.current;
  };

  const onPointerUp = () => {
    const delta = pointerDeltaX.current;
    pointerStartX.current = null;
    pointerDeltaX.current = 0;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) next();
    else prev();
  };

  return (
    <section
      id="carousel"
      className="border-y border-border/60 section-atmosphere py-10 md:py-14"
      aria-labelledby="carousel-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="container-page">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">{homeContent.carousel.kicker}</p>
            <h2 id="carousel-heading" className="display-title mt-2 text-[clamp(1.75rem,3.5vw,2.6rem)]">
              {homeContent.carousel.heading}
            </h2>
          </div>
        </div>

        <div
          id={regionId}
          className="card-highlight relative overflow-hidden rounded-lg border border-border bg-card outline-none"
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Product image carousel"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {products.map((product, slideIndex) => (
              <article
                key={product.id}
                className="min-w-full"
                aria-hidden={slideIndex !== index}
              >
                <div className="relative aspect-[4/5] bg-surface-low sm:aspect-[16/9] lg:min-h-[520px]">
                  <Image
                    src={product.image}
                    alt=""
                    fill
                    sizes="100vw"
                    className="object-contain object-center p-4 sm:p-8 lg:p-10"
                    priority={slideIndex < 2}
                  />
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-[30%] z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded border border-border bg-card text-navy shadow-sm transition hover:border-primary hover:text-primary sm:left-4 lg:top-1/2"
            aria-label="Previous product"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-[30%] z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded border border-border bg-card text-navy shadow-sm transition hover:border-primary hover:text-primary sm:right-4 lg:top-1/2"
            aria-label="Next product"
          >
            <Chevron direction="right" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="tablist" aria-label="Carousel pagination">
            {products.map((product, dotIndex) => {
              const selected = dotIndex === index;
              return (
                <button
                  key={product.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Show image ${dotIndex + 1}`}
                  aria-controls={regionId}
                  className={`h-2.5 rounded-sm transition-all ${
                    selected ? "w-9 bg-primary" : "w-2.5 bg-border hover:bg-outline"
                  }`}
                  onClick={() => goTo(dotIndex)}
                />
              );
            })}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {paused || reduceMotion ? "Paused on hover" : "Autoplay · swipe on mobile"}
          </p>
        </div>
      </div>
    </section>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      {direction === "left" ? (
        <path d="M11.5 3.5 6 9l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6.5 3.5 12 9l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
