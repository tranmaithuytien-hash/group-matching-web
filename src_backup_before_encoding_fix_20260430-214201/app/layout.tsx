import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteBreadcrumbs } from "../components/site-breadcrumbs";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarveClass | Hệ thống quản lý lớp học & Gamification",
  description:
    "Nền tảng quản l� lớp học th�ng minh t�ch hợp c�c tr� chơi tương t�c sinh động. Gi�p giảng vi�n kết nối với người học, tạo động lực học tập v� x�y dựng những lớp học marvelous đ�ng nghĩa.",
  icons: {
    icon: [
      { url: "/marveclass-logo.png", type: "image/png" },
      { url: "/marveclass-logo.png", rel: "shortcut icon", type: "image/png" }
    ],
    apple: [{ url: "/marveclass-logo.png", type: "image/png" }]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <div className="site-frame">
          <SiteHeader />
          <SiteBreadcrumbs />
          <div className="site-main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
