import Link from "next/link";
import { FindByPartButton } from "@/components/layout/find-by-part-button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 pt-12 pb-16 md:px-8">
      <h1 className="font-serif text-[34px] font-medium">We couldn’t find that page.</h1>
      <p className="text-[15px] opacity-75">The product may have been discontinued, or the link is out of date.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/c" className="rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2!">
          Browse categories
        </Link>
        <FindByPartButton className="rounded-lg border border-navy/35 px-4.5 py-2.5 text-sm font-medium" />
      </div>
    </div>
  );
}
