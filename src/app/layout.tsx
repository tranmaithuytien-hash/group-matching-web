import type { Metadata } from "next";
import type { ReactNode } from "react";`r`nimport { FirebaseBootstrap } from "../components/firebase-bootstrap";
import { SiteBreadcrumbs } from "../components/site-breadcrumbs";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarveClass | H? th?ng qu?n lý l?p h?c & Gamification",
  description:
    "N?n t?ng qu?n lý l?p h?c thông minh tích h?p các trò choi tuong tác sinh d?ng. Giúp gi?ng viên k?t n?i v?i ngu?i h?c, t?o d?ng l?c h?c t?p và xây d?ng nh?ng l?p h?c marvelous dúng nghia.",
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
      <body>`r`n        <FirebaseBootstrap />
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

