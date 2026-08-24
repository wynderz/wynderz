"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { galleryImages, homeContent } from "@/data/site";

export function ImageGallery() {
  const [active, setActive] = useState<number | null>(null);

  const close = useCallback(() => setActive(null), []);
  const showPrev = useCallback(() => {
    setActive((current) =>
      current == null ? current : (current - 1 + galleryImages.length) % galleryImages.length,
    );
  }, []);
  const showNext = useCallback(() => {
    setActive((current) =>
      current == null ? current : (current + 1) % galleryImages.length,
    );
  }, []);

  useEffect(() => {
    if (active == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active, close, showPrev, showNext]);

  const feature = galleryImages[0];
  const supporting = galleryImages.slice(1, 7);

  if (!feature) return null;

  return (
    <section id="gallery" className="section-pad section-atmosphere" aria-labelledby="gallery-heading">
      <div className="container-page">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">{homeContent.gallery.kicker}</p>
            <h2 id="gallery-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
              {homeContent.gallery.heading}
            </h2>
            <div className="accent-rule mt-5" aria-hidden />
          </div>
          <p className="max-w-md text-sm text-muted md:text-base">
            {homeContent.gallery.description}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-12 md:grid-rows-2 md:gap-4">
          <button
            type="button"
            onClick={() => setActive(0)}
            className="card-highlight group relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-card md:col-span-6 md:row-span-2 md:aspect-auto md:min-h-[560px]"
            aria-label={`Open gallery image: ${feature.alt}`}
          >
            <Image
              src={feature.src}
              alt={feature.alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="img-zoom object-contain p-8"
            />
          </button>

          {supporting.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index + 1)}
              className="card-highlight group relative aspect-[5/4] overflow-hidden rounded-lg border border-border bg-card md:col-span-3"
              aria-label={`Open gallery image: ${image.alt}`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 768px) 100vw, 25vw"
                className="img-zoom object-contain p-5"
              />
            </button>
          ))}
        </div>
      </div>

      {active != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-brand/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
          onClick={close}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white"
            onClick={close}
          >
            Close
          </button>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded border border-white/20 bg-white/10 px-3 py-3 text-white"
            aria-label="Previous image"
            onClick={(event) => {
              event.stopPropagation();
              showPrev();
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded border border-white/20 bg-white/10 px-3 py-3 text-white"
            aria-label="Next image"
            onClick={(event) => {
              event.stopPropagation();
              showNext();
            }}
          >
            ›
          </button>
          <div
            className="relative h-[70vh] w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={galleryImages[active].src}
              alt={galleryImages[active].alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
            <p className="absolute inset-x-0 bottom-0 bg-brand/70 px-4 py-3 text-center text-sm text-white">
              {galleryImages[active].alt}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
