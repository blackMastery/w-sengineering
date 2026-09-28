import type { Metadata, Viewport } from "next";
import { EB_Garamond, IBM_Plex_Mono, IBM_Plex_Sans, Yellowtail } from "next/font/google";
import { SessionProvider } from "@/components/auth/session-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartSync } from "@/components/cart/cart-sync";
import { CartSheet } from "@/components/cart/cart-sheet";
import { CartToast } from "@/components/cart/cart-toast";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SearchOverlay } from "@/components/layout/search-overlay";
import { getGroups } from "@/lib/catalog";
import "./globals.css";

const garamond = EB_Garamond({ variable: "--font-eb-garamond", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const yellowtail = Yellowtail({ variable: "--font-yellowtail", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: "W&S Engineering — Kraft Tool Co. reseller", template: "%s · W&S Engineering" },
  description: "Concrete, masonry, drywall, tile and measuring tools from Kraft Tool Co., W. Rose, Sands Level, Gator Tools and Hi-Craft.",
};

export const viewport: Viewport = { themeColor: "#13204a" };

// Static pages (home, /c) pick up admin catalog changes within 5 minutes.
export const revalidate = 300;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const groups = await getGroups();
  return (
    <html lang="en" className={`${garamond.variable} ${plexSans.variable} ${plexMono.variable} ${yellowtail.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <CartProvider>
            <CartSync />
            <Header groups={groups} />
            <main className="flex-1">{children}</main>
            <Footer groups={groups} />
            <CartSheet />
            <CartToast />
            <SearchOverlay groups={groups} />
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
