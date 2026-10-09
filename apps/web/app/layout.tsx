import type { Metadata, Viewport } from "next";
import { Montserrat, Noto_Sans_Ethiopic } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Providers } from "@/components/providers";
import { IntlRoot } from "@/lib/i18n/root";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

// Montserrat has no Ethiopic glyphs; Noto Sans Ethiopic renders Amharic.
const notoEthiopic = Noto_Sans_Ethiopic({
  variable: "--font-ethiopic",
  subsets: ["ethiopic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Inkomoko Assistant",
    template: "%s · Inkomoko Assistant",
  },
  description:
    "Ask Inkomoko’s assistant about programs, financing, and training in English or Amharic.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function BootSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Wordmark className="animate-pulse text-2xl" />
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${notoEthiopic.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <Providers>
          <Suspense fallback={<BootSplash />}>
            <IntlRoot>{children}</IntlRoot>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
