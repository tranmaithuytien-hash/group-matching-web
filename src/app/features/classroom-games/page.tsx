import Link from "next/link";
import { interactiveGameFeatures } from "../../../lib/site-data";

export default function ClassroomGamesPage() {
  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Game trên lớp</span>
            <h1>Những trò chơi giúp lớp học tương tác hơn.</h1>
          </div>
          <p>
            Đây là nhánh tập trung vào game hóa lớp học: thu ý kiến, quiz, timer và
            các mini game sẽ được mở rộng dần.
          </p>
        </div>

        <div className="feature-grid">
          {interactiveGameFeatures.map((feature) => (
            <article
              key={feature.slug}
              className={feature.status === "available" ? "feature-card" : "feature-card coming-soon"}
            >
              <div className="feature-top">
                <span className="feature-icon">{feature.icon}</span>
                <span className="feature-badge soon">
                  {feature.status === "available" ? "Có sẵn" : "Sắp ra mắt"}
                </span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <div className="feature-meta">
                <span>{feature.audience}</span>
                <Link href="/features/classroom-games">Trong lộ trình</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
