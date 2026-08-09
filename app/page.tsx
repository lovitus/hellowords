import type { Metadata } from "next";
import { WorldApp } from "./components/WorldApp";

export const metadata: Metadata = {
  title: "HelloWords · 词境",
  description: "在一座可以不断放大的世界里，自然遇见一万个常用英语词。",
};

export default function Home() {
  return <WorldApp />;
}
