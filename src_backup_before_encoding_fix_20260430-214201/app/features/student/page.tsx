import Link from "next/link";
import { studentLearningFeatures } from "../../../lib/site-data";

const featureRouteMap: Record<string, string> = {
  "student-review": "/features/student/review",
  "student-submission": "/features/student/submission",
  "student-scores": "/features/student/scores",
  "student-materials": "/features/student/materials"
};

export default function StudentFeaturesPage() {
  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Dành cho SV</span>
            <h1>Bộ công cụ học tập và theo dõi tiến độ dành riêng cho sinh viên.</h1>
          </div>
          <p>
            C�c t�nh năng n�y y�u cầu sinh vi�n đăng nhập trước khi sử dụng để bảo đảm đ�ng t�i khoản,
            đúng dữ liệu và đúng lớp học.
          </p>
        </div>

        <div className="feature-grid">
          {studentLearningFeatures.map((feature) => (
            <article
              key={feature.slug}
              className={feature.status === "available" ? "feature-card" : "feature-card coming-soon"}
            >
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
                <Link href={featureRouteMap[feature.slug] ?? "/features/student"}>
                  Xem chi tiết
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
