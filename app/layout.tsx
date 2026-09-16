import type { Metadata } from "next";
import "./beui.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "视觉资产库 | 造品平台",
  description: "按项目与视觉套系管理设计参考素材",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className="dark"><body>{children}</body></html>;
}
