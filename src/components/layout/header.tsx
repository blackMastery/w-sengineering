import Image from "next/image";
import Link from "next/link";
import type { Group } from "@/lib/types";
import { AccountLink } from "../auth/account-link";
import { CartButton } from "../cart/cart-button";
import { CategoryMenu } from "./category-menu";
import { SearchTrigger } from "./search-overlay";

export function Header({ groups }: { groups: Group[] }) {
  return (
    <header className="sticky top-0 z-30 bg-navy text-cream-2">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-0.5 px-2 md:h-16 md:gap-2 md:px-8 lg:gap-4">
        <div className="md:order-2">
          <CategoryMenu groups={groups} />
        </div>
        <Link href="/" className="flex flex-none items-center gap-2 text-cream-2! md:gap-2.5 md:order-1" aria-label="W&S Engineering home">
          <Image
            src="/logo.jpg"
            alt=""
            width={40}
            height={40}
            priority
            className="size-9 rounded-t-[18px] rounded-b-[3px] border-[1.5px] border-cream-2/45 object-cover object-[50%_30%] md:size-10"
          />
          <span className="font-script text-[19px] leading-none whitespace-nowrap max-[359px]:hidden md:text-[23px] lg:text-[28px]">
            W&amp;S Engineering
          </span>
        </Link>
        <div className="ml-auto flex items-center md:order-3 md:ml-0 md:min-w-0 md:flex-1 md:justify-end md:gap-1 lg:gap-2">
          <SearchTrigger />
          <AccountLink />
          <CartButton />
        </div>
      </div>
    </header>
  );
}
