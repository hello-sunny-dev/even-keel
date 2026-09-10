import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Archivo({ variable: "--font-display", subsets: ["latin"] });
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Even Keel",
  description: "Net worth for two.",
  // Nothing here should ever be indexed.
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Even Keel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e8eae5",
};

/**
 * Applied before the first paint, or a household that chose dark gets a full
 * white page for one frame on every navigation. It has to be inline and it has
 * to run early, which under this app's policy means carrying the nonce the
 * proxy minted for this request.
 */
const APPLY_STORED_THEME = `try{var t=localStorage.getItem("ek-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: APPLY_STORED_THEME }} />
      </head>
      <body className="min-h-dvh pb-20 sm:pb-0">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
