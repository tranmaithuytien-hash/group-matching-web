"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { getDemoSession } from "../../../../lib/auth-storage";
import {
  createTeacherClassListId,
  loadTeacherClassListsByOwner,
  parseTeacherClassSheetText,
  upsertTeacherClassList
} from "../../../../lib/class-lists";
import {
  createLearningMaterialId,
  loadLearningMaterialsByTeacher,
  upsertLearningMaterial,
  type LearningMaterial,
  type MaterialAttachment
} from "../../../../lib/learning-materials";
import {
  appendTopicSessionLog,
  computeGroupStructure,
  createTopicSessionId,
  createUniqueTopicClassCode,
  getTopicSessionById,
  loadTopicSessions,
  mapStudentsFromClassList,
  upsertTopicSession,
  type TopicPickerType
} from "../../../../lib/topic-picker";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Không thể đọc file."));
    reader.readAsDataURL(file);
  });
}

function materialPreviewText(material: LearningMaterial) {
  if (material.description?.trim()) return material.description.trim();
  if (material.attachments?.[0]) return `T�p: ${material.attachments[0].name}`;
  if (material.externalUrl) return `Link: ${material.externalUrl}`;
  return "Chưa có mô tả";
}

export default function TopicPickerCreatePage() {
  const router = useRouter();
  const [editId, setEditId] = useState("");

  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [classLists, setClassLists] = useState<ReturnType<typeof loadTeacherClassListsByOwner>>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);

  const [subjectName, setSubjectName] = useState("");
  const [subjectMode, setSubjectMode] = useState<"existing" | "upload">("existing");
  const [selectedSubjectCode, setSelectedSubjectCode] = useState("");
  const [uploadSubjectMode, setUploadSubjectMode] = useState<"existing" | "new">("existing");
  const [newUploadSubjectCode, setNewUploadSubjectCode] = useState("");
  const [newUploadSubjectName, setNewUploadSubjectName] = useState("");

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadExternalUrl, setUploadExternalUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<MaterialAttachment | null>(null);

  const [classListId, setClassListId] = useState("");
  const [classSourceMode, setClassSourceMode] = useState<"existing" | "new">("existing");
  const [newClassName, setNewClassName] = useState("");
  const [newClassRaw, setNewClassRaw] = useState("");

  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [topicCountInput, setTopicCountInput] = useState("1");
  const [typeValue, setTypeValue] = useState<TopicPickerType>(3);
  const [scoreColumn, setScoreColumn] = useState("ranking");
  const [type2DurationMinutesInput, setType2DurationMinutesInput] = useState("10");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditId(params.get("edit") || "");
    const session = getDemoSession();
    setTeacherEmail(session?.email || "");
    setTeacherName(session?.name || "");
  }, []);

  useEffect(() => {
    if (!teacherEmail) return;

    const classes = loadTeacherClassListsByOwner(teacherEmail);
    setClassLists(classes);
    if (classes.length > 0 && !classListId) setClassListId(classes[0].id);

    const loaded = loadLearningMaterialsByTeacher(teacherEmail).filter((item) => item.category === "presentation-topic");
    setMaterials(loaded);

    const subjectCodes = [...new Set(loaded.map((item) => item.courseCode).filter(Boolean))];
    if (subjectCodes.length > 0 && !selectedSubjectCode) {
      setSelectedSubjectCode(subjectCodes[0]);
      if (!editId) setSubjectName(subjectCodes[0]);
    }
  }, [teacherEmail, classListId, selectedSubjectCode, editId]);

  useEffect(() => {
    if (!editId || classLists.length === 0 || classListId) return;
    const session = getTopicSessionById(editId);
    if (!session) return;

    const byName = classLists.find((item) => item.className === session.className);
    if (byName) {
      setClassListId(byName.id);
    }
  }, [editId, classLists, classListId]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach((item) => {
      if (!item.courseCode) return;
      map.set(item.courseCode, item.courseName?.trim() ? `${item.courseCode} - ${item.courseName}` : item.courseCode);
    });
    return [...map.entries()].map(([code, label]) => ({ code, label }));
  }, [materials]);

  const candidateTopics = useMemo(() => {
    const subject = selectedSubjectCode || subjectName;
    return materials.filter((item) => item.courseCode === subject);
  }, [materials, selectedSubjectCode, subjectName]);

  useEffect(() => {
    if (!editId) return;
    const session = getTopicSessionById(editId);
    if (!session) return;

    setSubjectName(session.subjectName);
    setSelectedSubjectCode(session.subjectName);
    setClassListId(session.classListId);
    setTypeValue(session.type);
    setScoreColumn(session.scoreColumn || "ranking");
    setTopicCountInput(String(session.topicCount));
    setType2DurationMinutesInput(String(session.type === 1 ? session.type1PairingDurationMinutes || 10 : session.topic2DurationMinutes || 10));
  }, [editId]);

  const selectedClass = useMemo(() => classLists.find((item) => item.id === classListId) || null, [classLists, classListId]);

  const selectedTopics = useMemo(() => {
    const checked = candidateTopics.filter((item) => selectedTopicIds.includes(item.id));
    return checked.length > 0 ? checked.map((item) => item.title) : candidateTopics.map((item) => item.title);
  }, [candidateTopics, selectedTopicIds]);

  const topicCount = Math.max(1, Number(topicCountInput) || 1);
  const structure = computeGroupStructure(selectedClass?.students.length || 0, topicCount);

  const scoreOptions = useMemo(() => {
    if (!selectedClass) return [{ value: "ranking", label: "ranking" }];
    return [{ value: "ranking", label: "ranking" }, ...(selectedClass.customColumns || []).map((item) => ({ value: item, label: item }))];
  }, [selectedClass]);

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((current) => (current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId]));
  };

  const allCandidateSelected =
    candidateTopics.length > 0 && candidateTopics.every((item) => selectedTopicIds.includes(item.id));

  const toggleSelectAllTopics = (checked: boolean) => {
    if (!checked) {
      setSelectedTopicIds([]);
      return;
    }
    setSelectedTopicIds(candidateTopics.map((item) => item.id));
  };

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setStatusMessage("File vượt qu� 5MB. Vui l�ng chọn file nhỏ hơn.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadFile({ name: file.name, type: file.type, size: file.size, dataUrl });
      if (!uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      setStatusMessage(`Đã chọn file "${file.name}".`);
    } catch {
      setStatusMessage("Không thể đọc file.");
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveUploadedTopic = () => {
    if (!teacherEmail) return;

    const shouldCreateNewSubject =
      uploadSubjectMode === "new" || !selectedSubjectCode;
    const courseCode = shouldCreateNewSubject
      ? newUploadSubjectCode.trim().toUpperCase()
      : selectedSubjectCode.trim().toUpperCase();
    const courseName = shouldCreateNewSubject
      ? newUploadSubjectName.trim()
      : materials.find((item) => item.courseCode === selectedSubjectCode)?.courseName?.trim() || "";

    if (!courseCode) {
      setStatusMessage("Vui lòng chọn môn học hoặc nhập mã môn mới trước khi tải chủ đề.");
      return;
    }
    if (shouldCreateNewSubject && !courseName) {
      setStatusMessage("Vui lòng nhập tên môn khi tạo môn mới.");
      return;
    }
    if (!uploadTitle.trim()) {
      setStatusMessage("Vui lòng nhập tên chủ đề.");
      return;
    }
    if (!uploadFile && !uploadExternalUrl.trim()) {
      setStatusMessage("Vui lòng tải file hoặc nhập link.");
      return;
    }

    const now = Date.now();
    upsertLearningMaterial({
      id: createLearningMaterialId(),
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      courseCode,
      courseName,
      title: uploadTitle.trim(),
      description: uploadDescription.trim(),
      category: "presentation-topic",
      assignedClassListIds: classListId ? [classListId] : [],
      externalUrl: uploadExternalUrl.trim(),
      attachments: uploadFile ? [uploadFile] : [],
      createdAt: now,
      updatedAt: now
    });

    const loaded = loadLearningMaterialsByTeacher(teacherEmail).filter((item) => item.category === "presentation-topic");
    setMaterials(loaded);
    setSelectedSubjectCode(courseCode);
    setSubjectName(courseCode);
    setUploadSubjectMode("existing");
    setNewUploadSubjectCode("");
    setNewUploadSubjectName("");
    setUploadTitle("");
    setUploadDescription("");
    setUploadExternalUrl("");
    setUploadFile(null);
    setStatusMessage("Đã tải chủ đề lên thành công.");
  };

  const handleConfirmNewClassInput = () => {
    if (!teacherEmail) return setStatusMessage("Không tìm thấy tài khoản GV.");
    if (classSourceMode !== "new") return;
    const parsed = parseTeacherClassSheetText(newClassRaw);
    if (parsed.students.length === 0) {
      return setStatusMessage("Kh�ng đọc được danh s�ch lớp. H�y nhập theo định dạng: MSSV[TAB]Họ v� t�n[TAB]Email[TAB]Điểm.");
    }

    const nowClass = Date.now();
    const payload = {
      id: createTeacherClassListId(),
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      className: newClassName.trim() || "Lớp mới",
      students: parsed.students,
      customColumns: parsed.customColumns,
      sourceSessionId: "",
      createdAt: nowClass,
      updatedAt: nowClass
    };

    const saved = upsertTeacherClassList(payload);
    if (!saved) return setStatusMessage("Kh�ng thể x�c nhận danh s�ch lớp. Vui l�ng thử lại.");

    const refreshed = loadTeacherClassListsByOwner(teacherEmail);
    setClassLists(refreshed);
    setClassListId(saved.id);
    setClassSourceMode("existing");
    setStatusMessage(`Đ� x�c nhận lớp "${saved.className}" với ${saved.students.length} sinh vi�n.`);
  };

  const handleSaveSession = () => {
    if (!teacherEmail) return setStatusMessage("Không tìm thấy tài khoản GV.");

    let activeClass = selectedClass;
    if (classSourceMode === "new") {
      const parsed = parseTeacherClassSheetText(newClassRaw);
      if (parsed.students.length === 0) {
        return setStatusMessage("Không đọc được dữ liệu lớp mới. Vui lòng nhập thủ công đúng định dạng.");
      }

      const nowClass = Date.now();
      const payload = {
        id: createTeacherClassListId(),
        ownerTeacherEmail: teacherEmail,
        ownerTeacherName: teacherName || teacherEmail.split("@")[0],
        className: newClassName.trim() || "Lớp mới",
        students: parsed.students,
        customColumns: parsed.customColumns,
        sourceSessionId: "",
        createdAt: nowClass,
        updatedAt: nowClass
      };

      const savedClass = upsertTeacherClassList(payload);
      if (!savedClass) {
        return setStatusMessage("Không thể tạo lớp mới vào Lớp của tôi.");
      }

      activeClass = savedClass;
      const refreshed = loadTeacherClassListsByOwner(teacherEmail);
      setClassLists(refreshed);
      setClassListId(savedClass.id);
    }

    if (!activeClass && classSourceMode === "existing" && classLists.length > 0) {
      const fallbackClass = classLists.find((item) => item.id === classListId) || classLists[0];
      activeClass = fallbackClass || null;
      if (fallbackClass && classListId !== fallbackClass.id) {
        setClassListId(fallbackClass.id);
      }
    }

    if (!activeClass) return setStatusMessage("Vui lòng chọn lớp học.");

    const finalSubject = (selectedSubjectCode || subjectName).trim();
    if (!finalSubject) return setStatusMessage("Vui lòng chọn môn học.");
    if (selectedTopics.length < topicCount) return setStatusMessage("Số chủ đề được chọn phải >= số chủ đề trong phiên.");
    if (!structure.ok) return setStatusMessage(structure.message);
    const topic2DurationMinutes = Math.max(1, Number(type2DurationMinutesInput) || 10);

    const now = Date.now();
    const existing = editId ? getTopicSessionById(editId) : null;
    const sessionId = existing?.id || createTopicSessionId();
    const classCode = existing?.classCode || createUniqueTopicClassCode(loadTopicSessions().map((s) => s.classCode));
    const students = mapStudentsFromClassList(activeClass, scoreColumn);

    let payload: any = {
      id: sessionId,
      classCode,
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName,
      subjectName: finalSubject,
      classListId: activeClass.id,
      className: activeClass.className,
      topics: selectedTopics.slice(0, topicCount),
      topicCount,
      groupsOf2: structure.groupsOf2,
      groupsOf3: structure.groupsOf3,
      type: typeValue,
      scoreColumn: typeValue === 1 ? scoreColumn : "",
      students,
      credentialsByStudentId: existing?.credentialsByStudentId || {},
      finalGroups: existing?.finalGroups || [],
      status: existing?.status || "preparing",
      type1Stage: existing?.type1Stage,
      workingGroups: existing?.workingGroups || [],
      waveRequests: existing?.waveRequests || [],
      biddingRound: existing?.biddingRound || 1,
      bidRecords: existing?.bidRecords || [],
      groupRemainingPoints: existing?.groupRemainingPoints || {},
      topic2RoomMembers: existing?.topic2RoomMembers || {},
      topic2LockedTopics: existing?.topic2LockedTopics || [],
      type1PairingDurationMinutes: Math.max(1, Number(type2DurationMinutesInput) || 10),
      topic2DurationMinutes,
      topic2EndsAt: existing?.status === "running" && existing?.type === 2 ? existing.topic2EndsAt || 0 : 0,
      topic2FinalizedAt: existing?.status === "completed" && existing?.type === 2 ? existing.topic2FinalizedAt || 0 : 0,
      actionLogs: existing?.actionLogs || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    payload = appendTopicSessionLog(
      payload,
      existing ? "C�p nh�t c�u h�nh phi�n" : "T�o phi�n m�i",
      `${activeClass.className} · ${finalSubject} · ${topicCount} chủ đề`
    );

    upsertTopicSession(payload);
    router.push("/features/topic-picker/manage");
  };

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">{editId ? "S�a phi�n" : "T�o phi�n"}</span>
            <h1>{editId ? "C�p nh�t c�u h�nh phi�n l�a ch�n ch� �" : "C�u h�nh phi�n l�a ch�n ch� � thuy�t tr�nh"}</h1>
          </div>
        </div>

        <section className="group-form-card">
          <div className="field">
            <span>Môn học</span>
            <div className="group-action-row" style={{ marginBottom: 8 }}>
              <button type="button" className="hero-secondary" onClick={() => setSubjectMode("existing")}>Chọn từ Tài liệu</button>
              <button type="button" className="hero-secondary" onClick={() => setSubjectMode("upload")}>Tải chủ đề lên</button>
            </div>
            <select className="text-input" value={selectedSubjectCode} onChange={(e) => { setSelectedSubjectCode(e.target.value); setSubjectName(e.target.value); }}>
              {subjectOptions.length === 0 ? <option value="">Ch�a c� m�n trong T�i li�u</option> : null}
              {subjectOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </div>

          {subjectMode === "upload" ? (
            <article className="content-card" style={{ marginBottom: 16 }}>
              <h3>Tải chủ đề lên</h3>
              <div className="group-source-switch" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={uploadSubjectMode === "existing" ? "feature-tab active" : "feature-tab"}
                  onClick={() => setUploadSubjectMode("existing")}
                >
                  Môn có sẵn
                </button>
                <button
                  type="button"
                  className={uploadSubjectMode === "new" ? "feature-tab active" : "feature-tab"}
                  onClick={() => setUploadSubjectMode("new")}
                >
                  Tạo môn mới
                </button>
              </div>
              {uploadSubjectMode === "existing" ? (
                <label className="field">
                  <span>Môn học có sẵn</span>
                  <select
                    className="text-input"
                    value={selectedSubjectCode}
                    onChange={(event) => {
                      setSelectedSubjectCode(event.target.value);
                      setSubjectName(event.target.value);
                    }}
                  >
                    {subjectOptions.length === 0 ? <option value="">Ch�a c� m�n trong T�i li�u</option> : null}
                    {subjectOptions.map((item) => (
                      <option key={`upload-subject-${item.code}`} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="materials-form-grid">
                  <label className="field">
                    <span>Mã môn mới</span>
                    <input
                      className="text-input"
                      value={newUploadSubjectCode}
                      onChange={(event) => setNewUploadSubjectCode(event.target.value)}
                      placeholder="Ví dụ: MAR2023"
                    />
                  </label>
                  <label className="field">
                    <span>Tên môn mới</span>
                    <input
                      className="text-input"
                      value={newUploadSubjectName}
                      onChange={(event) => setNewUploadSubjectName(event.target.value)}
                      placeholder="Ví dụ: Nghiên cứu Marketing"
                    />
                  </label>
                </div>
              )}
              <label className="field">
                <span>Tên chủ đề</span>
                <input className="text-input" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>Nội dung mô tả</span>
                <textarea className="text-input group-textarea" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} />
              </label>
              <label className="field">
                <span>Đường dẫn tài liệu (tùy chọn)</span>
                <input className="text-input" value={uploadExternalUrl} onChange={(e) => setUploadExternalUrl(e.target.value)} placeholder="https://..." />
              </label>
              <label className="field">
                <span>File tài liệu (tối đa 5MB)</span>
                <input className="text-input" type="file" onChange={handleUploadFile} />
                {uploadFile ? <small className="hint-copy">� ch�n file: {uploadFile.name}</small> : null}
              </label>
              <button type="button" className="hero-primary" onClick={handleSaveUploadedTopic}>Lưu chủ đề</button>
            </article>
          ) : null}

          <div className="group-source-switch" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={classSourceMode === "existing" ? "feature-tab active" : "feature-tab"}
              onClick={() => {
                setClassSourceMode("existing");
                if (statusMessage) setStatusMessage("");
              }}
            >
              Dùng lớp trong Lớp của tôi
            </button>
            <button
              type="button"
              className={classSourceMode === "new" ? "feature-tab active" : "feature-tab"}
              onClick={() => {
                setClassSourceMode("new");
                if (statusMessage) setStatusMessage("");
              }}
            >
              Tạo lớp mới
            </button>
          </div>

          {classSourceMode === "existing" ? (
            <label className="field">
              <span>Lớp học</span>
              <select
                className="text-input"
                value={classListId}
                onChange={(e) => {
                  setClassListId(e.target.value);
                  if (statusMessage) setStatusMessage("");
                }}
              >
                {classLists.map((item) => <option key={item.id} value={item.id}>{item.className} ({item.students.length} SV)</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                <span>Tên lớp mới</span>
                <input className="text-input" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Ví dụ: SU26-BL2-DM2001" />
              </label>
              <label className="field">
                <span>Danh s�ch SV (nhập thủ c�ng)</span>
                <textarea
                  className="text-input group-textarea"
                  value={newClassRaw}
                  onChange={(e) => setNewClassRaw(e.target.value)}
                  placeholder="MSSV[TAB]Họ và tên[TAB]Email[TAB]Điểm"
                />
                <small className="hint-copy">
                  Mỗi dòng 1 sinh viên. Ví dụ: <code>SV001[TAB]Nguyễn Văn A[TAB]a@demo.edu[TAB]8.5</code>
                </small>
              </label>
              <button type="button" className="hero-secondary" onClick={handleConfirmNewClassInput}>
                X�c nhận nhập danh s�ch lớp
              </button>
            </>
          )}

          <div className="field">
            <span>Chọn chủ đề (tick để đưa vào phiên)</span>
            {candidateTopics.length === 0 ? <p className="hint-copy">Ch�a c� ch� � trong T�i li�u cho m�n n�y.</p> : null}
            {candidateTopics.length > 0 ? (
              <label className="materials-select-all" style={{ marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={allCandidateSelected}
                  onChange={(event) => toggleSelectAllTopics(event.target.checked)}
                />
                <span>Chọn tất cả</span>
              </label>
            ) : null}
            <div style={{ display: "grid", gap: 10 }}>
              {candidateTopics.map((item) => {
                const checked = selectedTopicIds.includes(item.id);
                const attachment = item.attachments?.[0];
                return (
                  <label key={item.id} className="content-card" style={{ padding: 12, display: "block" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTopic(item.id)} style={{ marginTop: 4 }} />
                      <div style={{ flex: 1 }}>
                        <strong>{item.title}</strong>
                        <p className="hint-copy" style={{ marginTop: 6 }}>{materialPreviewText(item)}</p>
                        {attachment?.dataUrl && attachment.type.startsWith("image/") ? <img src={attachment.dataUrl} alt={attachment.name} style={{ marginTop: 8, maxHeight: 120, borderRadius: 8 }} /> : null}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Số lượng chủ đề trong phiên</span>
            <input className="text-input" type="number" min={1} value={topicCountInput} onChange={(e) => setTopicCountInput(e.target.value)} />
          </label>

          <label className="field">
            <span>Kiểu chia</span>
            <select className="text-input" value={String(typeValue)} onChange={(e) => setTypeValue(Number(e.target.value) as TopicPickerType)}>
              <option value="1">Kiểu 1 - Đấu gi� chủ đề</option>
              <option value="2">Kiểu 2 - Tự chọn phòng</option>
              <option value="3">Kiểu 3 - Random hoàn toàn</option>
            </select>
          </label>

          {typeValue === 1 ? (
            <label className="field">
              <span>Cột điểm dùng cho game</span>
              <select className="text-input" value={scoreColumn} onChange={(e) => setScoreColumn(e.target.value)}>
                {scoreOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          ) : null}

          {typeValue === 2 ? (
            <label className="field">
              <span>Thời gian tự chọn phòng (phút)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                value={type2DurationMinutesInput}
                onChange={(e) => setType2DurationMinutesInput(e.target.value)}
              />
            </label>
          ) : null}
          {typeValue === 1 ? (
            <label className="field">
              <span>Thời gian vẫy tay ghép cặp (phút)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                value={type2DurationMinutesInput}
                onChange={(e) => setType2DurationMinutesInput(e.target.value)}
              />
            </label>
          ) : null}

          <p className="hint-copy">Cấu trúc nhóm: {structure.message}</p>

          <div className="group-action-row">
            <button type="button" className="hero-primary" onClick={handleSaveSession}>{editId ? "L�u thay �i" : "T�o phi�n"}</button>
            <Link href="/features/topic-picker/manage" className="hero-secondary">Sang trang quản lý</Link>
          </div>

          {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
        </section>
      </div>
    </main>
  );
}
