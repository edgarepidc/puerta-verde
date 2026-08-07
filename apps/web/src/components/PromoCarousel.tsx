'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface CarouselSlide {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string;
}

export function PromoCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const multi = slides.length > 1;

  const goTo = useCallback(
    (next: number) => {
      if (slides.length === 0) return;
      const len = slides.length;
      setIndex(((next % len) + len) % len);
    },
    [slides.length],
  );

  useEffect(() => {
    if (!multi || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [multi, paused, slides.length]);

  if (slides.length === 0) return null;

  const slide = slides[index] ?? slides[0];

  return (
    <section
      className="pv-hero-carousel relative mx-auto max-w-5xl overflow-hidden rounded-2xl sm:rounded-[1.5rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null || !multi) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 40) return;
        goTo(index + (delta < 0 ? 1 : -1));
      }}
    >
      <div className="relative aspect-[2.4/1] min-h-[140px] w-full sm:min-h-[180px] lg:min-h-[210px]">
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((item, i) => (
            <div key={item.id} className="relative h-full w-full shrink-0 grow-0 basis-full">
              <Image
                src={item.imageUrl}
                alt={item.title}
                fill
                priority={i === 0}
                className="object-cover"
                unoptimized={item.imageUrl.startsWith('http')}
                sizes="(max-width: 1024px) 100vw, 1024px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6 lg:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-green-200 sm:text-xs">
            Promoción
          </p>
          <h2 className="mt-1 max-w-2xl text-xl font-bold text-white sm:text-2xl lg:text-3xl">
            {slide.title}
          </h2>
          {slide.body && (
            <p className="mt-1 max-w-xl text-xs text-white/90 sm:text-sm line-clamp-2">
              {slide.body}
            </p>
          )}
          <a
            href="#catalogo"
            className="pointer-events-auto pv-btn-primary mt-3 inline-flex px-4 py-2 text-xs sm:mt-4 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Ver catálogo
          </a>
        </div>

        {multi && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-800 shadow sm:left-3 sm:h-10 sm:w-10"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-800 shadow sm:right-3 sm:h-10 sm:w-10"
            >
              ›
            </button>
            <div className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-3">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Ir a ${item.title}`}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? 'w-6 bg-white' : 'w-2 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
