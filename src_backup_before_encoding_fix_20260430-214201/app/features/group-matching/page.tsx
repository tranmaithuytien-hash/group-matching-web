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
            Đ�y l� t�nh năng hỗ trợ GV trong việc chia nh�m SV theo danh s�ch lớp. C� 4 v�ng cho to�n bộ
            qu� tr�nh chia nh�m:
          </p>
        </div>

        <article className="content-card group-matching-brief">
          <ul className="content-list">
            <li>Vòng 1: Bầu chọn nhóm trưởng (tất cả SV đều tham gia bầu chọn).</li>
            <li>Vòng 2: Matching nguyện vọng hai chiều giữa nhóm trưởng và thành viên.</li>
            <li>Vòng 3: Viết thư xin gia nhập phòng và duyệt thành viên theo thời gian thực.</li>
            <li>V�ng 4: Random fill c�c SV c�n lại v�o nh�m chưa đủ để chốt đội h�nh cuối.</li>
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
