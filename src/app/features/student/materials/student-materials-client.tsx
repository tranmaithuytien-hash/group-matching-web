"use client";

import { useEffect, useMemo, useState } from "react";
import { getDemoSession } from "../../../../lib/auth-storage";
import { loadTeacherClassLists } from "../../../../lib/class-lists";
import {
  getMaterialCategoryLabel,
  getStudentVisibleMaterials,
  type LearningMaterial
} from "../../../../lib/learning-materials";

function formatTimeLabel(timestamp: number) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(timestamp);
  } catch {
    return "";
  }
}

function normalizeExternalUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function toEmbeddableUrl(rawUrl: string) {
  const normalized = normalizeExternalUrl(rawUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host.includes("drive.google.com")) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
      if (fileMatch?.[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      }
      const idFromQuery = url.searchParams.get("id");
      if (idFromQuery) {
        return `https://drive.google.com/file/d/${idFromQuery}/preview`;
      }
    }
    return normalized;
  } catch {
    return normalized;
  }
}

export default function StudentMaterialsClient() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [searchCourseCode, setSearchCourseCode] = useState("");
  const [previewExternalUrl, setPreviewExternalUrl] = useState("");
  const [previewExternalTitle, setPreviewExternalTitle] = useState("");
  const [previewExternalOpenUrl, setPreviewExternalOpenUrl] = useState("");

  const classNameById = useMemo(() => {
    const mapper = new Map<string, string>();
    loadTeacherClassLists().forEach((classList) => {
      mapper.set(classList.id, classList.className);
    });
    return mapper;
  }, [materials]);

  useEffect(() => {
    const session = getDemoSession();
    const email = session?.role === "student" ? session.email : "";
    const name = session?.role === "student" ? session.name || "" : "";

    setStudentEmail(email);
    setStudentName(name);
    setMaterials(getStudentVisibleMaterials(email));
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!studentEmail) {
      return;
    }

    const refresh = () => setMaterials(getStudentVisibleMaterials(studentEmail));
    const intervalId = window.setInterval(refresh, 2000);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refresh);
    };
  }, [studentEmail]);

  const filteredMaterials = useMemo(() => {
    const query = searchCourseCode.trim().toUpperCase();
    if (!query) {
      return materials;
    }
    return materials.filter((material) => material.courseCode.toUpperCase().includes(query));
  }, [materials, searchCourseCode]);

  const groupedByCourse = useMemo(() => {
    const mapper = new Map<
      string,
      { courseCode: string; courseName: string; items: LearningMaterial[] }
    >();

    filteredMaterials.forEach((material) => {
      const key = material.courseCode.toUpperCase();
      const existing = mapper.get(key);
      if (existing) {
        existing.items.push(material);
        if (!existing.courseName && material.courseName) {
          existing.courseName = material.courseName;
        }
        return;
      }

      mapper.set(key, {
        courseCode: material.courseCode,
        courseName: material.courseName || "",
        items: [material]
      });
    });

    return Array.from(mapper.values()).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }, [filteredMaterials]);

  if (!isHydrated) {
    return (
      <main className="section-page">
        <div className="site-shell">
          <article className="content-card">
            <h2>Đang tải tài liệu học...</h2>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Dành cho SV</span>
            <h1 className="group-manage-page-title">Tài lệu theo môn</h1>
          </div>
          <p>
            Ch? hi?n th? t?i li?u thu?c l?p c? email c?a b?n. Ri?ng Slide b?i gi?ng v? Gi?o ?n
            chỉ dành cho Giảng viên nên sẽ không xuất hiện ở khu vực này.
          </p>
        </div>

        <section className="content-card">
          <div className="materials-list-head">
            <h2>Tài liệu khả dụng ({filteredMaterials.length})</h2>
            <label className="field materials-search-field">
              <span>Tìm theo mã môn</span>
              <input
                className="text-input"
                value={searchCourseCode}
                onChange={(event) => setSearchCourseCode(event.target.value)}
                placeholder="Ví dụ: DM2001"
              />
            </label>
          </div>

          {studentEmail ? (
            <p className="hint-copy">
              Đang đăng nhập với {studentName || studentEmail.split("@")[0]} ({studentEmail})
            </p>
          ) : null}

          {groupedByCourse.length === 0 ? (
            <p className="group-status-note">
              Hiện chưa có tài liệu phù hợp với lớp của bạn hoặc chưa có dữ liệu theo mã môn đang
              tìm.
            </p>
          ) : (
            <div className="materials-course-list">
              {groupedByCourse.map((courseGroup) => (
                <article key={courseGroup.courseCode} className="materials-course-block">
                  <div className="materials-course-head">
                    <h3>{courseGroup.courseCode}</h3>
                    {courseGroup.courseName ? <p>{courseGroup.courseName}</p> : null}
                  </div>

                  <div className="materials-list-grid">
                    {courseGroup.items.map((material) => (
                      <article key={material.id} className="materials-item-card">
                        <div className="feature-top">
                          <span className="section-eyebrow">{getMaterialCategoryLabel(material.category)}</span>
                          <span className="feature-badge">Có sẵn</span>
                        </div>
                        <h3>{material.title}</h3>
                        {material.description ? <p>{material.description}</p> : null}

                        <div className="materials-class-tags">
                          {material.assignedClassListIds.map((classId) => (
                            <span key={`${material.id}-${classId}`} className="materials-class-tag">
                              {classNameById.get(classId) || "Lớp đã gỡ"}
                            </span>
                          ))}
                        </div>

                        <p className="hint-copy">Cập nhật: {formatTimeLabel(material.updatedAt)}</p>

                        <div className="group-card-actions">
                          {material.externalUrl ? (
                            <button
                              type="button"
                              className="hero-secondary"
                              onClick={() => {
                                const normalizedUrl = normalizeExternalUrl(material.externalUrl || "");
                                if (!normalizedUrl) return;
                                setPreviewExternalUrl(toEmbeddableUrl(normalizedUrl));
                                setPreviewExternalOpenUrl(normalizedUrl);
                                setPreviewExternalTitle(material.title);
                              }}
                            >
                              Mở link
                            </button>
                          ) : null}
                          {(material.attachments || (material.attachment ? [material.attachment] : [])).map(
                            (file, fileIndex) => (
                              <a
                                key={`${material.id}-file-${fileIndex}`}
                                className="hero-secondary"
                                href={file.dataUrl}
                                download={file.name}
                              >
                                Tải: {file.name}
                              </a>
                            )
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      {previewExternalUrl ? (
        <div
          className="group-modal-overlay"
          onClick={() => {
            setPreviewExternalUrl("");
            setPreviewExternalTitle("");
            setPreviewExternalOpenUrl("");
          }}
        >
          <article
            className="group-modal-card materials-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="materials-preview-head">
              <h3>{previewExternalTitle || "Xem link"}</h3>
              <a
                className="hero-secondary"
                href={previewExternalOpenUrl || previewExternalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Mở tab mới
              </a>
              <button
                type="button"
                className="hero-secondary"
                onClick={() => {
                  setPreviewExternalUrl("");
                  setPreviewExternalTitle("");
                  setPreviewExternalOpenUrl("");
                }}
              >
                Đóng
              </button>
            </div>
            <div className="materials-preview-content">
              <iframe
                title={previewExternalTitle || "Link preview"}
                src={previewExternalUrl}
                className="materials-preview-frame"
              />
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}
