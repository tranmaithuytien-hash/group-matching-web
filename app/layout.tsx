import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarveClass | Hệ thống quản lý lớp học & Gamification",
  description:
    "Nền tảng quản lý lớp học thông minh tích hợp các trò chơi tương tác sinh động. Giúp GV kết nối với người học, tạo động lực học tập và xây dựng những lớp học \"marvelous\" đúng nghĩa."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
