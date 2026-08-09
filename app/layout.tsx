import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HelloWords · 词境",
  description: "一个安静、自由、可以不断放大的英语词汇世界。",
  openGraph: {
    title: "HelloWords · 词境",
    description: "从房间放大到物体、部件与材质，在探索中认识英语。",
    type: "website",
    images: [
      {
        url: "/og-world.jpg",
        width: 1200,
        height: 630,
        alt: "从公寓逐层放大到咖啡机、水箱与聚合物的词汇世界",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HelloWords · 词境",
    description: "一个可以不断放大的英语词汇世界。",
    images: ["/og-world.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
