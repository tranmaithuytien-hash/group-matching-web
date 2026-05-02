import Link from "next/link";
import { TeacherAuthGuard } from "../../../components/teacher-auth-guard";
import { classroomManagementFeatures } from "../../../lib/site-data";

const featureRouteMap: Record<string, string> = {
  "group-matching": "/features/group-matching",
  "presentation-topics": "/features/topic-picker",
  scoreboard: "/features/classroom-management",
  materials: "/features/materials"
};

export default function ClassroomManagementPage() {
  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Quản lý lớp học</span>
              <h1>C�c c�ng cụ gi�p lớp học vận h�nh gọn v� r� hơn.</h1>
            </div>
            <p>
              Từ chia nh�m đến bảng điểm v� t�i liệu, đ�y l� nh�nh t�nh năng phục vụ trực tiếp cho việc quản trị lớp học của
              giảng viên.
            </p>
          </div>

          <div className="feature-grid">
            {classroomManagementFeatures.map((feature) => (
              <article key={feature.slug} className={feature.status === "available" ? "feature-card" : "feature-card coming-soon"}>
                <div className="feature-top">
                  <span className="feature-icon">{feature.icon}</span>
                  <span className={feature.status === "available" ? "feature-badge" : "feature-badge soon"}>
                    {feature.status === "available" ? "C� s�n" : "S�p ra m�t"}
                  </span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <div className="feature-meta">
                  <span>{feature.audience}</span>
                  <Link href={feature.status === "available" ? featureRouteMap[feature.slug] ?? "/features/classroom-management" : "/features/classroom-management"}>
                    {feature.status === "available" ? "Xem chi ti�t" : "Trong l� tr�nh"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
