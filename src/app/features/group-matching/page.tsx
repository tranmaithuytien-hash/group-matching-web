import Link from "next/link";

export default function GroupMatchingFeaturePage() {
  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Tính năng có sẵn</span>
            <h1>Chia nhóm</h1>
          </div>
          <p>
            Đây là tính năng hỗ trợ GV trong việc chia nhóm SV theo danh sách lớp. Có 4 vòng cho toàn bộ
            quá trình chia nhóm:
          </p>
        </div>

        <article className="content-card group-matching-brief">
          <ul className="content-list">
            <li>Vòng 1: Bầu chọn nhóm trưởng (tất cả SV đều tham gia bầu chọn).</li>
            <li>Vòng 2: Matching nguyện vọng hai chiều giữa nhóm trưởng và thành viên.</li>
            <li>Vòng 3: Viết thư xin gia nhập phòng và duyệt thành viên theo thời gian thực.</li>
            <li>Vòng 4: Random fill các SV còn lại vào nhóm chưa đủ để chốt đội hình cuối.</li>
          </ul>
        </article>

        <div className="group-matching-actions">
          <Link href="/features/group-matching/create" className="hero-primary">
            Tạo mới
          </Link>
          <Link href="/features/group-matching/manage" className="hero-secondary">
            Quản lý
          </Link>
          <Link href="/features/group-matching/join" className="hero-secondary">
            Tham gia
          </Link>
        </div>
      </div>
    </main>
  );
}
