import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const description =
  "Portfolio de Jorge Cuadrado Criado, ingeniero informático en Salamanca: robótica, impresión 3D, hardware y docencia. Una placa de circuito que se rutea con el scroll.";

export const metadata: Metadata = {
  title: "Jorge Cuadrado Criado · portfolio",
  description,
  authors: [{ name: "Jorge Cuadrado Criado" }],
  creator: "Jorge Cuadrado Criado",
  icons: { icon: "/dkns.png" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    title: "Jorge Cuadrado Criado · portfolio",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#14181a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${chakra.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
