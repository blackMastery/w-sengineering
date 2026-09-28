"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductImage as Img } from "@/lib/types";
import { ProductImage } from "../product-image";

/** Swipeable on phones (scroll-snap), thumbnails below. Jumps to a variant's own photo when picked. */
export function Gallery({ images, name, focusPath }: { images: Img[]; name: string; focusPath: string | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Scrolling the track updates `index` via onScroll.
  const scrollTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const i = focusPath ? images.findIndex((img) => img.path === focusPath) : -1;
    const el = track.current;
    if (i >= 0 && el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, [focusPath, images]);

  if (images.length === 0) {
    return <ProductImage path={null} alt={name} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-square rounded-2xl" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto rounded-2xl"
      >
        {images.map((img, i) => (
          <ProductImage
            key={img.id}
            path={img.path}
            alt={i === 0 ? name : `${name}, photo ${i + 1}`}
            sizes="(min-width: 768px) 50vw, 100vw"
            priority={i === 0}
            className="aspect-square w-full flex-none snap-center"
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="no-scrollbar flex gap-2.5 overflow-x-auto" role="tablist" aria-label="Photos">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`flex-none overflow-hidden rounded-lg border-2 ${i === index ? "border-navy" : "border-transparent"}`}
            >
              <ProductImage path={img.path} alt="" sizes="80px" className="size-16 md:size-20" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
