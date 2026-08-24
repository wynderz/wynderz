import type { Metadata } from "next";
import { Hanken_Grotesk, Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Hanken_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.wynderz.in"),
  title: {
    default: "WYNDERZ Pvt. Ltd. | Advanced Filament Winding Solutions",
    template: "%s | WYNDERZ Pvt. Ltd.",
  },
  description:
    "WYNDERZ Pvt. Ltd. manufactures and exports winding machines, filament winders and multi-spindle winding machines from Hyderabad, Telangana, India",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/images/brand/logo-180.png", type: "image/png", sizes: "180x180" },
    ],
    apple: "/images/brand/logo-180.png",
  },
  openGraph: {
    title: "WYNDERZ Pvt. Ltd., Hyderabad",
    description:
      "Filament Winding Machines and Accessories from WYNDERZ Pvt. Ltd., Hyderabad.",
    url: "https://www.wynderz.in/",
    images: [
      {
        url: "/images/brand/logo.png",
        width: 800,
        height: 800,
        alt: "WYNDERZ Pvt. Ltd. logo",
      },
    ],
  },
};

const themeInitScript = `
(function(){
  try {
    var stored = localStorage.getItem('wynderz-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = theme;
    root.dataset.theme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
