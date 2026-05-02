import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell footer-grid">
        <section>
          <div className="footer-brand">
            <span className="footer-brand-logo">
              <Image src="/marveclass-logo.png" alt="MarveClass logo" width={64} height={64} />
            </span>
            <div>
              <p className="footer-title">MarveClass</p>
              <p className="footer-tagline">A marvelous classroom</p>
            </div>
          </div>
          <p className="footer-text">
            Nền tảng quản lý lớp học thông minh tích hợp game hóa để giúp giảng viên kết nối tốt hơn với người học và
            tạo n�n những lớp học đ�ng nhớ.
          </p>
        </section>

        <section>
          <p className="footer-title">Tính năng nổi bật</p>
          <div className="footer-feature-columns">
            <div className="footer-feature-group">
              <p className="footer-feature-title">Quản lý lớp học</p>
              <div className="footer-links">
                <Link href="/features/group-matching">Chia nhóm</Link>
                <Link href="/features/classroom-management">Chủ đề thuyết trình</Link>
                <Link href="/features/classroom-management">Bảng điểm</Link>
              </div>
            </div>
            <div className="footer-feature-group">
              <p className="footer-feature-title">Game trên lớp</p>
              <div className="footer-links">
                <Link href="/features/classroom-games">Lắng nghe ý kiến</Link>
                <Link href="/features/classroom-games">Timer lớp học</Link>
                <Link href="/features/classroom-games">Quiz tương t�c</Link>
              </div>
            </div>
            <div className="footer-feature-group">
              <p className="footer-feature-title">Dành cho SV</p>
              <div className="footer-links">
                <Link href="/features/student/review">Ôn tập</Link>
                <Link href="/features/student/submission">Nộp bài</Link>
                <Link href="/features/student/scores">Xem bảng điểm</Link>
              </div>
            </div>
          </div>
        </section>

        <section>
          <p className="footer-title">Liên kết nhanh</p>
          <div className="footer-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/features">Tính năng</Link>
            <Link href="/library">Thư viện</Link>
            <Link href="/login">Đăng nhập</Link>
          </div>
        </section>

        <section>
          <p className="footer-title">Ủng hộ Marveclass</p>
          <div className="footer-donate">
            <div className="footer-qr-wrap">
              <Image
                className="footer-qr"
                src="/bank-QR-code-cropped.jpg"
                alt="QR chuyển khoản ủng hộ MarveClass"
                width={220}
                height={220}
              />
            </div>
            <small className="footer-donate-caption">Quét mã QR để ủng hộ MarveClass.</small>
          </div>
          <div className="footer-links footer-contact">
            <p className="footer-contact-title">Thông tin liên hệ</p>
            <a href="mailto:tranmaithuytien@gmail.com">Email: tranmaithuytien@gmail.com</a>
            <a href="tel:0931618147">SĐT / Zalo: 093 1618 147</a>
          </div>
        </section>
      </div>
    </footer>
  );
}
