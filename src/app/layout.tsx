import type { Metadata } from "next";
import { Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";

const arabicFont = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap"
});

export const metadata: Metadata = {
  title: "أنا خربان",
  description: "لوحة متابعة البلاغات المدنية في الأردن"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${arabicFont.variable} bg-stone-100 text-charcoal-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
