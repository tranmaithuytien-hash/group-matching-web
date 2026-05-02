import { TeacherAuthGuard } from "../../../components/teacher-auth-guard";

export default function ScoresPage() {
  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Bảng điểm</span>
              <h1>Theo dõi điểm theo lớp, theo sinh viên và xuất dữ liệu.</h1>
            </div>
            <p>
              Đ�y l� khu vực sẽ mở rộng cho bộ lọc lớp, sinh vi�n, m�n học v� thao t�c
              nhập hoặc cập nhật điểm theo đúng roadmap của MarveClass.
            </p>
          </div>
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
