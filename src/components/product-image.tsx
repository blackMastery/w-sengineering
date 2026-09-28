import Image from "next/image";
import { imageUrl } from "@/lib/format";

/** Product photo on a cream tile (photos are transparent cut-outs), or a striped placeholder. */
export function ProductImage({
  path,
  alt,
  sizes,
  className = "",
  priority = false,
}: {
  path: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (!path) {
    return (
      <div className={`stripes flex items-end p-3 ${className}`}>
        <span className="font-mono text-[11px] opacity-50">No photo yet</span>
      </div>
    );
  }
  return (
    <div className={`relative bg-cream-2 ${className}`}>
      <Image
        src={imageUrl(path)}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain p-[8%] mix-blend-multiply"
      />
    </div>
  );
}
