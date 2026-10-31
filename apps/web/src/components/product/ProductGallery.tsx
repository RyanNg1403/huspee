'use client';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from './messages';

/** Swipeable images on phones; main image with thumbnails on wider screens. */
export function ProductGallery({
  images,
  name,
  index,
  onIndex,
}: {
  images: string[];
  name: string;
  index: number;
  onIndex: (index: number) => void;
}) {
  const t = useT(messages);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    // Instant, so the scroll handler only sees the final position.
    if (Math.abs(el.scrollLeft - index * el.clientWidth) > 1) el.scrollTo({ left: index * el.clientWidth });
  }, [index]);
  if (images.length === 0) return <div className="aspect-square w-full bg-gray-100 sm:rounded-md" />;
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div role="group" aria-label={t('images')} className="min-w-0">
      <div className="relative sm:hidden">
        <div
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget;
            const next = Math.round(el.scrollLeft / el.clientWidth);
            if (next !== index && next >= 0 && next < images.length) onIndex(next);
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((url, i) => (
            <Image
              key={`${url}-${i}`}
              unoptimized
              width={780}
              height={780}
              src={url}
              alt={i === 0 ? name : ''}
              className="aspect-square w-full shrink-0 snap-center bg-gray-100 object-cover"
            />
          ))}
        </div>
        {images.length > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
            {t('imageCount', { n: index + 1, total: images.length })}
          </span>
        )}
      </div>
      <div className="hidden flex-col gap-2.5 sm:flex">
        <Image
          unoptimized
          width={800}
          height={800}
          src={current}
          alt={name}
          className="aspect-square w-full rounded-md bg-gray-100 object-cover"
        />
        {images.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                aria-label={t('showImage', { n: i + 1 })}
                aria-pressed={i === index}
                onClick={() => onIndex(i)}
                onMouseEnter={() => onIndex(i)}
                className={`h-[72px] w-[72px] overflow-hidden rounded border-2 transition ${i === index ? 'border-primary' : 'border-transparent hover:border-line-strong'}`}
              >
                <Image
                  unoptimized
                  width={144}
                  height={144}
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
