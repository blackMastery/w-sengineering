import Link from "next/link";

export function SectionHeading({ title, href, linkLabel = "View all", id }: { title: string; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 md:mb-5">
      <h2 id={id} className="font-serif text-[26px] font-medium md:text-[32px]">
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm whitespace-nowrap underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
