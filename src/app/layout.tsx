import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font descarga y empaqueta las fuentes en build (CI con internet);
// en runtime se sirven desde la propia app — el NAS no tiene salida a internet.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SGC Documental — ESE Hospital Nuestra Señora de Fátima",
    template: "%s · SGC Documental",
  },
  description:
    "Sistema de gestión documental de calidad de la ESE Hospital Nuestra Señora de Fátima de Suaza — NTC ISO 9001:2015",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
