import Link from "next/link";
import { interactiveGameFeatures } from "../../../lib/site-data";

export default function ClassroomGamesPage() {
  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Game trên lớp</span>
            <h1>Những tr� chơi gi�p lớp học tương t�c hơn.</h1>
          </div>
          <p>
            Đ�y l� nh�nh tập trung v�o game h�a lớp học: thu � kiến, quiz, timer v�
            c�c mini game sẽ được mở rộng dần.
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
                  {feature.status === "available" ? "C� s�n" : "S�p ra m�t"}
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
