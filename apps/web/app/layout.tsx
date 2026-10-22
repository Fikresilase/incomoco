import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Providers } from "@/components/providers";
import { IntlRoot } from "@/lib/i18n/root";
import "./globals.css";

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
      className="h-full"
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
