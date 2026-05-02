"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  classroomManagementFeatures,
  interactiveGameFeatures,
  studentLearningFeatures
} from "../lib/site-data";

const featureGroups = [
  {
    key: "classroom",
    title: "Quản lý lớp học",
    href: "/features/classroom-management",
    description:
      "C�c c�ng cụ gi�p giảng vi�n vận h�nh lớp tốt hơn từ chia nh�m, chọn chủ đề đến bảng điểm v� t�i liệu.",
    items: classroomManagementFeatures
  },
  {
    key: "games",
    title: "Game trên lớp",
    href: "/features/classroom-games",
    description:
      "C�c game v� c�ng cụ tương t�c như lắng nghe � kiến, timer, quiz v� nhiều hoạt động sẽ bổ sung dần.",
    items: interactiveGameFeatures
  },
  {
    key: "student",
    title: "Dành cho SV",
    href: "/features/student",
    description:
      "Bao gồm �n tập, Nộp b�i, Xem bảng điểm v� T�i lệu. Nh�nh n�y y�u cầu sinh vi�n đăng nhập.",
    items: studentLearningFeatures
  }
] as const;

type FeatureGroupKey = (typeof featureGroups)[number]["key"];

export default function HomePage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState("");
  const railRefs = useRef<Record<FeatureGroupKey, HTMLDivElement | null>>({
    classroom: null,
    games: null,
    student: null
  });

  useEffect(() => {
    const setupCenteredPreview = window.setTimeout(() => {
      featureGroups.forEach((group) => {
        const rail = railRefs.current[group.key];

        if (!rail) {
          return;
        }

        const firstCard = rail.querySelector<HTMLElement>(".feature-rail-card");

        if (!firstCard) {
          return;
        }

        const gap = 18;
        const step = firstCard.offsetWidth + gap;
        rail.scrollLeft = step / 2;
      });
    }, 80);

    return () => window.clearTimeout(setupCenteredPreview);
  }, []);

  const scrollRail = (groupKey: FeatureGroupKey, direction: "prev" | "next") => {
    const rail = railRefs.current[groupKey];

    if (!rail) {
      return;
    }

    const firstCard = rail.querySelector<HTMLElement>(".feature-rail-card");

    if (!firstCard) {
      return;
    }

    const gap = 18;
    const step = firstCard.offsetWidth + gap;

    rail.scrollBy({
      left: direction === "next" ? step : -step,
      behavior: "smooth"
    });
  };

  const handleQuickJoin = () => {
    const normalizedCode = classCode.trim();

    if (!normalizedCode) {
      window.alert("Vui lòng nhập code để vào trò chơi.");
      return;
    }

    router.push(`/waiting?code=${encodeURIComponent(normalizedCode)}`);
  };

  return (
    <main>
      <section className="join-top-section">
        <div className="site-shell">
          <div className="join-top-card">
            <span className="hero-pill">Vào game nhanh cho sinh viên</span>
            <h1 className="join-top-title">Nhập code để tham gia game ngay!</h1>
            <p className="join-top-copy">Nhập đúng code do giảng viên cung cấp để tham gia vào game.</p>

            <div className="join-top-form">
              <input
                className="text-input join-top-input"
                value={classCode}
                onChange={(event) => setClassCode(event.target.value)}
                placeholder="Ví dụ: A1B2C3"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleQuickJoin();
                  }
                }}
              />

              <button className="quick-join-button" onClick={handleQuickJoin}>
                Tham gia
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="site-shell">
          <div className="marveclass-intro">
            <div className="intro-brand-lockup">
              <span className="intro-logo-wrap">
                <Image src="/marveclass-logo.png" alt="MarveClass logo" width={88} height={88} />
              </span>
              <div>
                <span className="section-eyebrow">Giới thiệu MarveClass</span>
                <h2 className="intro-title">Một nền tảng để lớp học trở nên sống động hơn.</h2>
              </div>
            </div>
            <p className="hero-copy">
              MarveClass được ph�t triển để gi�p giảng vi�n tổ chức lớp học theo c�ch hiện đại hơn: c�
              thể tạo game, quản l� lớp, chia sẻ class code, triển khai t�i liệu v� từng bước x�y dựng
              một hệ sinh th�i gamification ho�n chỉnh cho đại học.
            </p>
          </div>
        </div>
      </section>

      <section className="section-block section-soft">
        <div className="site-shell">
          <div className="section-head feature-group-head">
            <div>
              <span className="section-eyebrow">Tính năng MarveClass</span>
              <h2>Từng công cụ nhỏ, ghép lại thành một lớp học thú vị hơn.</h2>
            </div>
            <p>
              MarveClass ph�t triển c�c t�nh năng nhằm hỗ trợ GV trong việc quản l� v� hoạt động lớp.
            </p>
          </div>

          <div className="feature-showcase feature-showcase-dual">
            {featureGroups.map((group) => (
              <article key={group.key} className="feature-gradient-box">
                <div className="feature-gradient-left">
                  <h3 className="feature-showcase-title">{group.title}</h3>
                  <p className="feature-showcase-copy">{group.description}</p>
                  <Link href={group.href} className="feature-slider-link feature-slider-link-light">
                    Xem toàn bộ
                  </Link>
                </div>

                <div className="feature-gradient-right">
                  <button
                    type="button"
                    className="feature-nav-arrow feature-nav-arrow-left"
                    onClick={() => scrollRail(group.key, "prev")}
                    aria-label={`L�i danh s�ch ${group.title}`}
                  >
                    ‹
                  </button>

                  <div className="feature-rail-wrap">
                    <div
                      className="feature-rail"
                      ref={(element) => {
                        railRefs.current[group.key] = element;
                      }}
                    >
                      {group.items.map((feature) => (
                        <article
                          key={feature.slug}
                          className={
                            feature.status === "available"
                              ? "feature-card feature-rail-card"
                              : "feature-card feature-rail-card coming-soon"
                          }
                        >
                          <div className="feature-top">
                            <span className="feature-icon">{feature.icon}</span>
                            <span
                              className={
                                feature.status === "available" ? "feature-badge" : "feature-badge soon"
                              }
                            >
                              {feature.status === "available" ? "C� s�n" : "S�p ra m�t"}
                            </span>
                          </div>
                          <h3>{feature.title}</h3>
                          <p>{feature.description}</p>
                          <div className="feature-meta">
                            <span>{feature.audience}</span>
                            <Link
                              href={
                                feature.status === "available"
                                  ? `/features/${feature.slug}`
                                  : group.href
                              }
                            >
                              {feature.status === "available" ? "M� t�nh nng" : "Xem l� tr�nh"}
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="feature-nav-arrow feature-nav-arrow-right"
                    onClick={() => scrollRail(group.key, "next")}
                    aria-label={`Tiến danh s�ch ${group.title}`}
                  >
                    �
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
