import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteTitle = "MarveClass | Hệ thống quản lý lớp học & Gamification";
const siteDescription =
  "Nền tảng quản lý lớp học thông minh tích hợp các trò chơi tương tác sinh động. Giúp GV kết nối với người học, tạo động lực học tập và xây dựng những lớp học \"marvelous\" đúng nghĩa.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.marveclass.io.vn"),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://www.marveclass.io.vn",
    siteName: "MarveClass",
    type: "website",
    locale: "vi_VN",
    images: [
      {
        url: "/icon.png",
        width: 1200,
        height: 1200,
        alt: "Logo MarveClass"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/icon.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
