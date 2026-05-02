"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  classroomManagementFeatures,
  interactiveGameFeatures,
  studentLearningFeatures
} from "../../lib/site-data";

type FeatureTabKey = "classroom" | "games" | "student";

const tabConfig: Record<
  FeatureTabKey,
  {
    label: string;
    description: string;
    href: string;
    items: typeof classroomManagementFeatures;
  }
> = {
  classroom: {
    label: "Quản lý lớp học",
    description: "Nhóm công cụ hỗ trợ giảng viên vận hành lớp học.",
    href: "/features/classroom-management",
    items: classroomManagementFeatures
  },
  games: {
    label: "Game trên lớp",
    description: "Nh�m game v� hoạt động tương t�c trong giờ học.",
    href: "/features/classroom-games",
    items: interactiveGameFeatures
  },
  student: {
    label: "Dành cho SV",
    description: "Nh�m t�nh năng c� nh�n của sinh vi�n (y�u cầu đăng nhập).",
    href: "/features/student",
    items: studentLearningFeatures
  }
};

const featureRouteMap: Record<string, string> = {
  "group-matching": "/features/group-matching",
  "presentation-topics": "/features/topic-picker",
  scoreboard: "/features/classroom-management",
  materials: "/features/materials",
  "opinion-wall": "/features/classroom-games",
  timer: "/features/classroom-games",
  quiz: "/features/classroom-games",
  "class-bingo": "/features/classroom-games",
  "student-review": "/features/student/review",
  "student-submission": "/features/student/submission",
  "student-scores": "/features/student/scores",
  "student-materials": "/features/student/materials"
};

export default function FeaturesPage() {
  const [activeTab, setActiveTab] = useState<FeatureTabKey>("classroom");
  const activeSection = useMemo(() => tabConfig[activeTab], [activeTab]);

  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single features-main-head">
          <div>
            <span className="section-eyebrow">Danh s�ch t�nh năng</span>
            <h1 className="features-page-title">Tất cả t�nh năng được t�ch r� theo từng nh�m.</h1>
          </div>
          <p>
            Chọn tab b�n dưới để xem danh s�ch đầy đủ t�nh năng của từng nh�m: Quản l� lớp học, Game
            trên lớp và Dành cho SV.
          </p>
        </div>

        <div className="feature-tabs" role="tablist" aria-label="Nhóm tính năng">
          {(Object.keys(tabConfig) as FeatureTabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={activeTab === key ? "feature-tab active" : "feature-tab"}
              onClick={() => setActiveTab(key)}
            >
              {tabConfig[key].label}
            </button>
          ))}
        </div>

        <section className="feature-tab-panel" role="tabpanel">
          <div className="feature-tab-head">
            <h2>{activeSection.label}</h2>
            <p>{activeSection.description}</p>
          </div>

          <div className="feature-grid">
            {activeSection.items.map((feature) => (
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
                  <Link href={featureRouteMap[feature.slug] ?? activeSection.href}>
                    {feature.status === "available" ? "Xem chi ti�t" : "Xem trang nh�m"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
