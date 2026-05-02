import Link from "next/link";
import { TeacherAuthGuard } from "../../components/teacher-auth-guard";

const metrics = [
  { label: "Lớp đang hoạt động", value: "04" },
  { label: "Tổng sinh viên", value: "152" },
  { label: "Phiên đã chạy", value: "11" },
  { label: "Tài liệu đã upload", value: "28" }
];

const quickLinks = [
  {
    href: "/dashboard/classes",
    label: "Lớp của tôi",
    note: "Danh s�ch lớp đ� import v� lịch sử cập nhật"
  },
  { href: "/dashboard/scores", label: "Bảng điểm", note: "Theo dõi điểm và xuất dữ liệu" },
  { href: "/dashboard/materials", label: "T�i liệu", note: "Upload, g�n lớp, quản l� file" },
  {
    href: "/features/group-matching",
    label: "Khởi chạy Group Matching",
    note: "Mở phi�n tương t�c ngay"
  }
];

export default function DashboardPage() {
  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Dashboard Giảng viên</span>
              <h1>Một nơi để điều phối lớp, hoạt động và dữ liệu học tập.</h1>
            </div>
            <p>
              Đ�y l� khung dashboard theo t�i liệu đặc tả. N� gom đủ c�c khu quản l� lớp,
              điểm, t�i liệu v� truy cập nhanh t�nh năng để n�ng cấp dần th�nh hệ thống ho�n
              chỉnh.
            </p>
          </div>

          <div className="dashboard-metrics">
            {metrics.map((metric) => (
              <article key={metric.label} className="metric-box">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>

          <div className="content-grid dashboard-links">
            {quickLinks.map((item) => (
              <Link key={item.href} href={item.href} className="content-card content-card-link">
                <h2>{item.label}</h2>
                <p>{item.note}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
