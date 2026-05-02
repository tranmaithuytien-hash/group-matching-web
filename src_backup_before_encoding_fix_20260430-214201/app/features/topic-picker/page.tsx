import Link from "next/link";

export default function TopicPickerFeaturePage() {
  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Tính năng có sẵn</span>
            <h1>Lựa chọn chủ đề thuyết trình</h1>
          </div>
          <p>
            Tạo phi�n chọn chủ đề theo 3 kiểu: Đấu gi�, Tự chọn ph�ng v� Random ho�n to�n. Hệ thống tự t�nh cấu tr�c
            nhóm 2 TV và 3 TV theo số SV và số chủ đề.
          </p>
        </div>

        <article className="content-card group-matching-brief">
          <ul className="content-list">
            <li>Kiểu 1: Đấu gi� chủ đề theo nh�m (c� điểm game).</li>
            <li>Kiểu 2: SV tự vào phòng chủ đề và chốt nhóm.</li>
            <li>Kiểu 3: Random nhóm + random chủ đề trong 1 nút bấm.</li>
          </ul>
        </article>

        <div className="group-matching-actions">
          <Link href="/features/topic-picker/create" className="hero-primary">
            Tạo phiên
          </Link>
          <Link href="/features/topic-picker/manage" className="hero-secondary">
            Quản lý
          </Link>
          <Link href="/features/topic-picker/join" className="hero-secondary">
            Sinh viên tham gia
          </Link>
        </div>
      </div>
    </main>
  );
}
