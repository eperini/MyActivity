import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyActivity",
  description: "Gestisci i tuoi task e abitudini",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="dark">
      <body className={`${geist.variable} font-sans bg-zinc-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
