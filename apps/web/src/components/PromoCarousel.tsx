'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export interface CarouselSlide {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string;
}

export function PromoCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const slide = slides[index] ?? slides[0];

  return (
    <section className="pv-hero-carousel relative overflow-hidden rounded-[1.75rem]">
      <div className="relative aspect-[16/9] min-h-[220px] w-full sm:min-h-[280px] lg:aspect-[21/9] lg:min-h-[340px]">
        {slides.map((item, i) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={i !== index}
          >
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              priority={i === 0}
              className="object-cover"
              unoptimized={item.imageUrl.startsWith('http')}
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
          </div>
        ))}

        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-8 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-200">
            Promoción
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
            {slide.title}
          </h2>
          {slide.body && (
            <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">{slide.body}</p>
          )}
          <a
            href="#catalogo"
            className="pv-btn-primary mt-5 inline-flex px-5 py-2.5 text-sm"
          >
            Ver catálogo
          </a>
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
              className="absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-800 shadow sm:flex"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => setIndex((current) => (current + 1) % slides.length)}
              className="absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-800 shadow sm:flex"
            >
              ›
            </button>
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 sm:bottom-4">
              {slides.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Ir a ${item.title}`}
                  onClick={() => setIndex(i)}
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
