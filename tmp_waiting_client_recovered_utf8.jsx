"use client";

import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDemoSession } from "./src/lib/auth-storage";
import { expireRound3Applications, findGroupMatchingSessionByCode, findParticipantByEmail, getCurrentRoundStatusLabel, getLeaderCapacity, getLeaderIds, getParticipantRole, getRequiredRound1VoteCount, hasStudentCredential, markStudentLoggedIn, reviewRound3Application, submitRound1Vote, submitRound2LeaderRanking, submitRound2MemberPreference, submitRound3Application, upsertRound3Room, upsertStudentCredential } from "./src/lib/group-matching";
function roundHint(roundLabel) {
    if (roundLabel === "Vòng 1") {
        return "Vòng 1 đã mở. Bạn hãy bình chọn Nhóm trưởng ngay bên dưới.";
    }
    if (roundLabel === "Vòng 2") {
        return "Vòng 2 đã mở. Bạn vui lòng gửi nguyện vọng đúng vai trò của mình.";
    }
    if (roundLabel === "Vòng 3") {
        return "Vòng 3 đã mở. Nhóm trưởng tạo phòng, thành viên gửi thư xin gia nhập.";
    }
    if (roundLabel === "Vòng 4") {
        return "Vòng 4 đang diễn ra. Giảng viên sẽ random fill để hoàn tất game.";
    }
    if (roundLabel === "Phòng chờ") {
        return "Vui lòng chờ Giảng viên mở vòng chơi tiếp theo.";
    }
    if (roundLabel === "Đã kết thúc") {
        return "Game đã kết thúc. Bạn có thể chờ phiên mới từ Giảng viên.";
    }
    return `Hiện tại đang ở ${roundLabel}. Vui lòng theo dõi hướng dẫn trong lớp.`;
}
function tempSessionKey(sessionId) {
    return `gm_temp_student_session:${sessionId}`;
}
function readTempSession(sessionId) {
    const raw = window.localStorage.getItem(tempSessionKey(sessionId));
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.studentId) {
            return null;
        }
        return parsed;
    } catch  {
        return null;
    }
}
function saveTempSession(value) {
    window.localStorage.setItem(tempSessionKey(value.sessionId), JSON.stringify(value));
}
function clearTempSession(sessionId) {
    window.localStorage.removeItem(tempSessionKey(sessionId));
}
function isApplicationExpired(submittedAtMs, visibleDurationMs) {
    return submittedAtMs > 0 && Date.now() > submittedAtMs + visibleDurationMs;
}
function formatCountdown(totalMs) {
    const safeMs = Math.max(totalMs, 0);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
export default function WaitingClient({ classCode, initialName, initialStudentId }) {
    const router = useRouter();
    const normalizedCode = classCode.trim().toUpperCase();
    const hasHydratedTempSessionRef = useRef(false);
    const [sessionSnapshot, setSessionSnapshot] = useState(()=>findGroupMatchingSessionByCode(normalizedCode));
    const [selectedStudentId, setSelectedStudentId] = useState("");
    const [hasManualStudentSelection, setHasManualStudentSelection] = useState(false);
    const [joinedStudentId, setJoinedStudentId] = useState("");
    const [enteredPassword, setEnteredPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [voteTargetIds, setVoteTargetIds] = useState([]);
    const [memberPreferenceIds, setMemberPreferenceIds] = useState([
        "",
        ""
    ]);
    const [leaderRankingIds, setLeaderRankingIds] = useState([]);
    const [roomName, setRoomName] = useState("");
    const [selectedTargetLeaderId, setSelectedTargetLeaderId] = useState("");
    const [applicationLetter, setApplicationLetter] = useState("");
    const [reviewingApplicantId, setReviewingApplicantId] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const officialStudentEmail = useMemo(()=>{
        const session = getDemoSession();
        if (!session || session.role !== "student") {
            return "";
        }
        return session.email || "";
    }, []);
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useEffect(()=>{
        const refresh = ()=>{
            if (!normalizedCode) {
                return;
            }
            setSessionSnapshot(findGroupMatchingSessionByCode(normalizedCode));
        };
        refresh();
        const intervalId = window.setInterval(refresh, 1000);
        window.addEventListener("storage", refresh);
        return ()=>{
            window.clearInterval(intervalId);
            window.removeEventListener("storage", refresh);
        };
    }, [
        normalizedCode
    ]);
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useEffect(()=>{
        if (!sessionSnapshot || sessionSnapshot.currentRound !== "round3") {
            return;
        }
        const intervalId = window.setInterval(()=>{
            const nextSession = expireRound3Applications(sessionSnapshot.id);
            if (nextSession) {
                setSessionSnapshot(nextSession);
            }
        }, 1000);
        return ()=>{
            window.clearInterval(intervalId);
        };
    }, [
        sessionSnapshot?.id,
        sessionSnapshot?.currentRound
    ]);
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useEffect(()=>{
        hasHydratedTempSessionRef.current = false;
        setHasManualStudentSelection(false);
        setVoteTargetIds([]);
        setMemberPreferenceIds([
            "",
            ""
        ]);
        setLeaderRankingIds([]);
        setRoomName("");
        setSelectedTargetLeaderId("");
        setApplicationLetter("");
    }, [
        sessionSnapshot?.id
    ]);
    const officialMatchedStudent = useMemo(()=>{
        if (!sessionSnapshot || !officialStudentEmail) {
            return null;
        }
        return findParticipantByEmail(sessionSnapshot, officialStudentEmail);
    }, [
        officialStudentEmail,
        sessionSnapshot
    ]);
    process.env.__NEXT_PRIVATE_MINIMIZE_MACRO_FALSE && useEffect(()=>{
        if (!sessionSnapshot) {
            return;
        }
        const participantIds = new Set(sessionSnapshot.participants.map((participant)=>participant.studentId));
        const storedTemp = readTempSession(sessionSnapshot.id);
        if (storedTemp && participantIds.has(storedTemp.studentId)) {
            if (!hasHydratedTempSessionRef.current) {
                const requiredVoteCount = getRequiredRound1VoteCount(sessionSnapshot);
                const existingRound1Votes = sessionSnapshot.round1Votes?.[storedTemp.studentId] || [];
                const existingMemberPrefs = sessionSnapshot.round2MemberPreferences?.[storedTemp.studentId] || [];
                const existingLeaderRankings = sessionSnapshot.round2LeaderRankings?.[storedTemp.studentId] || [];
                const existingRoom = sessionSnapshot.round3Rooms?.[storedTemp.studentId];
                const existingApplication = sessionSnapshot.round3Applications?.[storedTemp.studentId];
                setJoinedStudentId(storedTemp.studentId);
                setSelectedStudentId(storedTemp.studentId);
                setVoteTargetIds(Array.from({
                    length: requiredVoteCount
                }, (_, index)=>existingRound1Votes[index] || ""));
                setMemberPreferenceIds([
                    existingMemberPrefs[0] || "",
                    existingMemberPrefs[1] || ""
                ]);
                setLeaderRankingIds(existingLeaderRankings);
                setRoomName(existingRoom?.roomName || "");
                setSelectedTargetLeaderId(existingApplication?.targetLeaderStudentId || "");
                setApplicationLetter(existingApplication?.applicationLetter || "");
                hasHydratedTempSessionRef.current = true;
            } else {
                setJoinedStudentId((current)=>current || storedTemp.studentId);
                setSelectedStudentId((current)=>current || storedTemp.studentId);
            }
            return;
        }
        if (storedTemp) {
            clearTempSession(sessionSnapshot.id);
        }
        if (joinedStudentId && participantIds.has(joinedStudentId)) {
            return;
        }
        if (joinedStudentId && !participantIds.has(joinedStudentId)) {
            setJoinedStudentId("");
        }
        if (hasManualStudentSelection && selectedStudentId && participantIds.has(selectedStudentId)) {
            return;
        }
        if (selectedStudentId && participantIds.has(selectedStudentId)) {
            return;
        }
        if (officialMatchedStudent) {
            setSelectedStudentId(officialMatchedStudent.studentId);
            return;
        }
        const studentById = sessionSnapshot.participants.find((participant)=>participant.studentId === initialStudentId) || null;
        const studentByName = sessionSnapshot.participants.find((participant)=>participant.fullName === initialName) || null;
        const matchedFromQuery = studentById || studentByName;
        if (matchedFromQuery) {
            setSelectedStudentId(matchedFromQuery.studentId);
            return;
        }
        setSelectedStudentId("");
    }, [
        sessionSnapshot,
        initialName,
        initialStudentId,
        officialMatchedStudent,
        hasManualStudentSelection,
        selectedStudentId,
        joinedStudentId
    ]);
    const selectedStudent = useMemo(()=>{
        if (!sessionSnapshot || !selectedStudentId) {
            return null;
        }
        return sessionSnapshot.participants.find((participant)=>participant.studentId === selectedStudentId) || null;
    }, [
        sessionSnapshot,
        selectedStudentId
    ]);
    const joinedStudent = useMemo(()=>{
        if (!sessionSnapshot || !joinedStudentId) {
            return null;
        }
        return sessionSnapshot.participants.find((participant)=>participant.studentId === joinedStudentId) || null;
    }, [
        sessionSnapshot,
        joinedStudentId
    ]);
    if (!sessionSnapshot) {
        return /*#__PURE__*/ _jsx("main", {
            className: "page-shell",
            children: /*#__PURE__*/ _jsxs("section", {
                className: "card",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "student-card-head",
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "eyebrow",
                                children: "Khu vực sinh vi\xean"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "student-home-link",
                                onClick: ()=>router.push("/"),
                                children: "Về trang chủ"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("h1", {
                        children: "Kh\xf4ng t\xecm thấy phi\xean"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        className: "lead",
                        children: [
                            "Kh\xf4ng t\xecm thấy game với class code ",
                            /*#__PURE__*/ _jsx("strong", {
                                children: classCode || "Chưa có class code"
                            }),
                            "."
                        ]
                    })
                ]
            })
        });
    }
    const currentRoundLabel = getCurrentRoundStatusLabel(sessionSnapshot.currentRound, sessionSnapshot.roundsEnabled);
    const isRound1Active = sessionSnapshot.currentRound === "round1";
    const isRound2Active = sessionSnapshot.currentRound === "round2";
    const isRound3Active = sessionSnapshot.currentRound === "round3";
    const isRound4Active = sessionSnapshot.currentRound === "round4" || sessionSnapshot.currentRound === "completed";
    const isRound4Completed = sessionSnapshot.currentRound === "completed";
    const requiredRound1VoteCount = getRequiredRound1VoteCount(sessionSnapshot);
    const isOfficialAutoMatched = Boolean(officialMatchedStudent?.studentId) && officialMatchedStudent?.studentId === selectedStudentId;
    const role = joinedStudentId ? getParticipantRole(sessionSnapshot, joinedStudentId) : "pending";
    const leaderIds = getLeaderIds(sessionSnapshot);
    const leaders = leaderIds.map((leaderId)=>sessionSnapshot.participants.find((participant)=>participant.studentId === leaderId)).filter(Boolean);
    const round2MemberChoiceCount = Math.min(2, leaders.length);
    const memberIds = sessionSnapshot.participants.map((participant)=>participant.studentId).filter((studentId)=>getParticipantRole(sessionSnapshot, studentId) === "member");
    const leaderQuota = joinedStudentId ? getLeaderCapacity(sessionSnapshot, joinedStudentId) : 0;
    const submittedRound1Votes = joinedStudentId ? sessionSnapshot.round1Votes?.[joinedStudentId] || [] : [];
    const submittedMemberPreferences = joinedStudentId ? sessionSnapshot.round2MemberPreferences?.[joinedStudentId] || [] : [];
    const submittedLeaderRankings = joinedStudentId ? sessionSnapshot.round2LeaderRankings?.[joinedStudentId] || [] : [];
    const currentLeaderRoom = joinedStudentId ? sessionSnapshot.round3Rooms?.[joinedStudentId] : null;
    const allRooms = Object.values(sessionSnapshot.round3Rooms || {});
    const allApplications = Object.values(sessionSnapshot.round3Applications || {});
    const myApplication = joinedStudentId ? sessionSnapshot.round3Applications?.[joinedStudentId] : null;
    const createdRoomCount = allRooms.filter((room)=>room.roomName.trim()).length;
    const requiredRoomCount = leaders.length;
    const allRequiredRoomsCreated = requiredRoomCount > 0 && createdRoomCount >= requiredRoomCount;
    const round3OpenedAt = sessionSnapshot.roundOpenedAt?.round3 || 0;
    const round3ElapsedMs = round3OpenedAt > 0 ? Math.max(Date.now() - round3OpenedAt, 0) : 0;
    const round3MemberComposeLimitMs = 5 * 60 * 1000;
    const round3ComposeRemainingMs = Math.max(round3MemberComposeLimitMs - round3ElapsedMs, 0);
    const isAfterRound3ComposeLimit = round3OpenedAt > 0 && round3ElapsedMs > round3MemberComposeLimitMs;
    const round3ComposeRemainingSeconds = Math.ceil(round3ComposeRemainingMs / 1000);
    const round3ComposeRemainingMinutesLabel = `${Math.floor(round3ComposeRemainingSeconds / 60)}:${String(round3ComposeRemainingSeconds % 60).padStart(2, "0")}`;
    const myObservedRoom = joinedStudentId ? allRooms.find((room)=>{
        const roomMemberIds = [
            ...room.observerMemberIds || [],
            ...room.admittedMemberIds || []
        ];
        return roomMemberIds.includes(joinedStudentId);
    }) || null : null;
    const isRoomNameLocked = Boolean(currentLeaderRoom?.roomName?.trim());
    const isMatchedInRound2 = Boolean(joinedStudentId && (sessionSnapshot.matchingResults || []).some((group)=>group.memberStudentIds.includes(joinedStudentId)));
    const pendingLeaderApplications = allApplications.filter((application)=>application.targetLeaderStudentId === joinedStudentId && application.status === "pending" && !isApplicationExpired(application.submittedAtMs, application.visibleDurationMs));
    const handleBackHome = ()=>{
        clearTempSession(sessionSnapshot.id);
        setJoinedStudentId("");
        setVoteTargetIds([]);
        setMemberPreferenceIds([
            "",
            ""
        ]);
        setLeaderRankingIds([]);
        setRoomName("");
        setSelectedTargetLeaderId("");
        setApplicationLetter("");
        setSelectedStudentId(officialMatchedStudent?.studentId || "");
        router.push("/");
    };
    const handleStartWaiting = ()=>{
        if (!selectedStudent) {
            setStatusMessage("Vui lòng chọn đúng tên sinh viên trước khi bắt đầu.");
            return;
        }
        if (hasStudentCredential(sessionSnapshot, selectedStudent.studentId)) {
            if (!isOfficialAutoMatched) {
                if (!enteredPassword.trim()) {
                    setStatusMessage("Vui lòng nhập mật khẩu để tiếp tục vào phiên.");
                    return;
                }
                const verified = sessionSnapshot.studentCredentials?.[selectedStudent.studentId]?.password === enteredPassword.trim();
                if (!verified) {
                    setStatusMessage("Mật khẩu chưa đúng.");
                    return;
                }
            }
        } else {
            if (!newPassword.trim() || !confirmPassword.trim()) {
                setStatusMessage("Vui lòng tạo mật khẩu cho lần đầu vào phiên.");
                return;
            }
            if (newPassword.trim().length < 4) {
                setStatusMessage("Mật khẩu cần tối thiểu 4 ký tự.");
                return;
            }
            if (newPassword.trim() !== confirmPassword.trim()) {
                setStatusMessage("Mật khẩu xác nhận chưa khớp.");
                return;
            }
            const linkedEmail = isOfficialAutoMatched && officialStudentEmail ? officialStudentEmail : selectedStudent.email || "";
            const nextSession = upsertStudentCredential({
                sessionId: sessionSnapshot.id,
                studentId: selectedStudent.studentId,
                password: newPassword.trim(),
                linkedEmail
            });
            if (!nextSession) {
                setStatusMessage("Không thể lưu mật khẩu lúc này, vui lòng thử lại.");
                return;
            }
            setSessionSnapshot(nextSession);
        }
        saveTempSession({
            sessionId: sessionSnapshot.id,
            studentId: selectedStudent.studentId,
            studentName: selectedStudent.fullName,
            joinedAt: Date.now()
        });
        const loginTrackedSession = markStudentLoggedIn(sessionSnapshot.id, selectedStudent.studentId);
        if (loginTrackedSession) {
            setSessionSnapshot(loginTrackedSession);
        }
        setJoinedStudentId(selectedStudent.studentId);
        setVoteTargetIds(Array.from({
            length: requiredRound1VoteCount
        }, (_, index)=>sessionSnapshot.round1Votes?.[selectedStudent.studentId]?.[index] || ""));
        setMemberPreferenceIds([
            sessionSnapshot.round2MemberPreferences?.[selectedStudent.studentId]?.[0] || "",
            sessionSnapshot.round2MemberPreferences?.[selectedStudent.studentId]?.[1] || ""
        ]);
        setLeaderRankingIds(sessionSnapshot.round2LeaderRankings?.[selectedStudent.studentId] || []);
        setRoomName(sessionSnapshot.round3Rooms?.[selectedStudent.studentId]?.roomName || "");
        setSelectedTargetLeaderId(sessionSnapshot.round3Applications?.[selectedStudent.studentId]?.targetLeaderStudentId || "");
        setApplicationLetter(sessionSnapshot.round3Applications?.[selectedStudent.studentId]?.applicationLetter || "");
        setEnteredPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setStatusMessage("Đã vào phòng chờ thành công.");
    };
    const handleRound1VoteChange = (index, nextValue)=>{
        setVoteTargetIds((current)=>{
            const nextVotes = Array.from({
                length: requiredRound1VoteCount
            }, (_, voteIndex)=>current[voteIndex] || "");
            nextVotes[index] = nextValue;
            return nextVotes;
        });
    };
    const handleSubmitRound1Vote = ()=>{
        if (!joinedStudentId) {
            setStatusMessage("Bạn cần bấm Bắt đầu để vào phòng chờ trước.");
            return;
        }
        if (submittedRound1Votes.length === requiredRound1VoteCount) {
            setStatusMessage("Bạn đã gửi bình chọn Vòng 1, phiếu đã bị khóa.");
            return;
        }
        const cleanedVotes = voteTargetIds.map((value)=>value.trim()).filter(Boolean);
        const uniqueVotes = [
            ...new Set(cleanedVotes)
        ];
        if (cleanedVotes.length !== requiredRound1VoteCount || uniqueVotes.length !== requiredRound1VoteCount) {
            setStatusMessage(`Vui lòng chọn đủ ${requiredRound1VoteCount} sinh viên khác nhau.`);
            return;
        }
        const nextSession = submitRound1Vote(sessionSnapshot.id, joinedStudentId, uniqueVotes);
        if (!nextSession) {
            setStatusMessage("Không thể gửi phiếu. Có thể phiếu đã bị khóa hoặc dữ liệu chưa hợp lệ.");
            return;
        }
        setSessionSnapshot(nextSession);
        setStatusMessage("Đã gửi bình chọn Vòng 1 thành công. Phiếu của bạn đã bị khóa.");
    };
    const handleSubmitRound2MemberPreference = ()=>{
        if (!joinedStudentId) {
            return;
        }
        if (submittedMemberPreferences.length === round2MemberChoiceCount && round2MemberChoiceCount > 0) {
            setStatusMessage("Bạn đã gửi nguyện vọng Vòng 2 và hiện đã bị khóa.");
            return;
        }
        const cleaned = memberPreferenceIds.map((value)=>value.trim()).filter(Boolean);
        const unique = [
            ...new Set(cleaned)
        ];
        if (unique.length !== round2MemberChoiceCount) {
            setStatusMessage(`Vui lòng chọn đủ ${round2MemberChoiceCount} nguyện vọng Nhóm trưởng.`);
            return;
        }
        const nextSession = submitRound2MemberPreference(sessionSnapshot.id, joinedStudentId, unique);
        if (!nextSession) {
            setStatusMessage("Không thể gửi nguyện vọng Vòng 2. Có thể phiếu đã bị khóa.");
            return;
        }
        setSessionSnapshot(nextSession);
        setStatusMessage("Đã gửi nguyện vọng Vòng 2 thành công. Phiếu của bạn đã bị khóa.");
    };
    const handleSubmitRound2LeaderRanking = ()=>{
        if (!joinedStudentId) {
            return;
        }
        if (submittedLeaderRankings.length === leaderQuota && leaderQuota > 0) {
            setStatusMessage("Bạn đã gửi danh sách ưu tiên Vòng 2 và hiện đã bị khóa.");
            return;
        }
        const cleaned = leaderRankingIds.map((value)=>value.trim()).filter(Boolean);
        const unique = [
            ...new Set(cleaned)
        ];
        if (unique.length !== leaderQuota) {
            setStatusMessage(`Vui lòng chọn đủ ${leaderQuota} thành viên theo thứ tự ưu tiên.`);
            return;
        }
        const nextSession = submitRound2LeaderRanking(sessionSnapshot.id, joinedStudentId, unique);
        if (!nextSession) {
            setStatusMessage("Không thể gửi danh sách ưu tiên Vòng 2. Có thể phiếu đã bị khóa.");
            return;
        }
        setSessionSnapshot(nextSession);
        setStatusMessage("Đã gửi danh sách ưu tiên Vòng 2 thành công. Phiếu của bạn đã bị khóa.");
    };
    const handleSaveRound3Room = ()=>{
        if (!joinedStudentId || role !== "leader") {
            return;
        }
        if (isRoomNameLocked) {
            setStatusMessage("Tên phòng đã được chốt và không thể sửa nữa.");
            return;
        }
        if (!roomName.trim()) {
            setStatusMessage("Vui lòng nhập tên phòng trước khi lưu.");
            return;
        }
        const nextSession = upsertRound3Room(sessionSnapshot.id, joinedStudentId, roomName.trim());
        if (!nextSession) {
            setStatusMessage("Không thể lưu tên phòng lúc này. Có thể tên phòng đã được chốt.");
            return;
        }
        setSessionSnapshot(nextSession);
        setStatusMessage("Đã cập nhật tên phòng thành công.");
    };
    const handleSubmitRound3Application = ()=>{
        if (!joinedStudentId || role !== "member") {
            return;
        }
        if (isMatchedInRound2) {
            setStatusMessage("Bạn đã có phòng từ kết quả Vòng 2 nên không cần gửi thư.");
            return;
        }
        if (!selectedTargetLeaderId) {
            setStatusMessage("Vui lòng chọn phòng muốn gửi thư.");
            return;
        }
        if (!applicationLetter.trim()) {
            setStatusMessage("Vui lòng nhập thư xin gia nhập.");
            return;
        }
        const nextSession = submitRound3Application(sessionSnapshot.id, joinedStudentId, selectedTargetLeaderId, applicationLetter.trim());
        if (!nextSession) {
            setStatusMessage("Không thể gửi thư lúc này. Mỗi thành viên chỉ được gửi 1 lần hoặc phòng đã đầy.");
            return;
        }
        setSessionSnapshot(nextSession);
        setStatusMessage("Đã gửi thư xin gia nhập thành công.");
    };
    const handleReviewApplication = (applicantId, decision)=>{
        if (!joinedStudentId || role !== "leader") {
            return;
        }
        setReviewingApplicantId(applicantId);
        try {
            const nextSession = reviewRound3Application(sessionSnapshot.id, joinedStudentId, applicantId, decision);
            if (!nextSession) {
                setStatusMessage("Không thể xử lý thư này lúc này.");
                return;
            }
            setSessionSnapshot(nextSession);
            setStatusMessage(decision === "accepted" ? "Đã đồng ý thư xin gia nhập." : "Đã từ chối thư xin gia nhập.");
        } finally{
            setReviewingApplicantId("");
        }
    };
    const finalAssignedGroup = isRound4Active ? (sessionSnapshot.finalGroups || []).find((group)=>group.leaderStudentId === joinedStudentId || group.memberStudentIds.includes(joinedStudentId)) : null;
    const round3AssignedGroup = joinedStudentId ? (sessionSnapshot.round3Results || []).find((group)=>group.leaderStudentId === joinedStudentId || group.memberStudentIds.includes(joinedStudentId)) : null;
    const round2AssignedGroup = joinedStudentId ? (sessionSnapshot.matchingResults || []).find((group)=>group.leaderStudentId === joinedStudentId || group.memberStudentIds.includes(joinedStudentId)) : null;
    const round2ResultBlock = /*#__PURE__*/ _jsxs("div", {
        className: "status-box",
        children: [
            /*#__PURE__*/ _jsx("p", {
                className: "status-label",
                children: "Kết quả V\xf2ng 2"
            }),
            round2AssignedGroup ? /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        className: "status-value",
                        children: round2AssignedGroup.leaderStudentId === joinedStudentId ? "Bạn là Nhóm trưởng của nhóm hiện tại." : `Bạn đã match với Nhóm trưởng ${round2AssignedGroup.leaderFullName}.`
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        className: "group-student-list",
                        style: {
                            marginTop: 12
                        },
                        children: round2AssignedGroup.memberFullNames.length > 0 ? round2AssignedGroup.memberFullNames.map((fullName, index)=>/*#__PURE__*/ _jsx("div", {
                                className: "group-student-item",
                                children: /*#__PURE__*/ _jsx("span", {
                                    children: fullName
                                })
                            }, `${fullName}-${index}`)) : /*#__PURE__*/ _jsx("div", {
                            className: "group-student-item",
                            children: /*#__PURE__*/ _jsx("span", {
                                children: "Bạn chưa c\xf3 được sự gh\xe9p nh\xf3m n\xe0o."
                            })
                        })
                    })
                ]
            }) : /*#__PURE__*/ _jsx("p", {
                className: "status-value",
                children: "Bạn chưa c\xf3 được sự gh\xe9p nh\xf3m n\xe0o."
            })
        ]
    });
    return /*#__PURE__*/ _jsx("main", {
        className: "page-shell",
        children: /*#__PURE__*/ _jsxs("section", {
            className: "card card-wide",
            children: [
                /*#__PURE__*/ _jsxs("div", {
                    className: "student-card-head",
                    children: [
                        /*#__PURE__*/ _jsx("span", {
                            className: "eyebrow",
                            children: "Khu vực sinh vi\xean"
                        }),
                        /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            className: "student-home-link",
                            onClick: handleBackHome,
                            children: "Về trang chủ"
                        })
                    ]
                }),
                /*#__PURE__*/ _jsx("h1", {
                    className: "group-student-session-title",
                    children: joinedStudent ? `Xin chào, ${joinedStudent.fullName}` : `Phiên chia nhóm của lớp ${sessionSnapshot.className}`
                }),
                joinedStudent ? /*#__PURE__*/ _jsxs("p", {
                    className: "hint-copy",
                    style: {
                        marginTop: -8
                    },
                    children: [
                        "đ\xe3 tham gia v\xe0o phần chia nh\xf3m của lớp ",
                        sessionSnapshot.className,
                        "."
                    ]
                }) : null,
                /*#__PURE__*/ _jsxs("p", {
                    className: "lead",
                    children: [
                        "Class code: ",
                        /*#__PURE__*/ _jsx("strong", {
                            children: sessionSnapshot.classCode
                        })
                    ]
                }),
                !joinedStudent ? /*#__PURE__*/ _jsxs("div", {
                    className: "status-box",
                    children: [
                        isOfficialAutoMatched ? /*#__PURE__*/ _jsxs("p", {
                            className: "hint-copy",
                            children: [
                                "Hệ thống đ\xe3 nhận diện bạn l\xe0 ",
                                /*#__PURE__*/ _jsx("strong", {
                                    children: selectedStudent?.fullName
                                }),
                                " theo email đăng nhập."
                            ]
                        }) : /*#__PURE__*/ _jsxs("label", {
                            className: "field",
                            children: [
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Chọn t\xean Sinh vi\xean"
                                }),
                                /*#__PURE__*/ _jsxs("select", {
                                    className: "text-input",
                                    value: selectedStudentId,
                                    onChange: (event)=>{
                                        setSelectedStudentId(event.target.value);
                                        setHasManualStudentSelection(true);
                                        setStatusMessage("");
                                        setEnteredPassword("");
                                        setNewPassword("");
                                        setConfirmPassword("");
                                        setVoteTargetIds([]);
                                    },
                                    children: [
                                        /*#__PURE__*/ _jsx("option", {
                                            value: "",
                                            children: "-- Chọn t\xean của bạn --"
                                        }),
                                        sessionSnapshot.participants.map((participant)=>/*#__PURE__*/ _jsx("option", {
                                                value: participant.studentId,
                                                children: participant.fullName
                                            }, participant.studentId))
                                    ]
                                })
                            ]
                        }),
                        selectedStudent ? hasStudentCredential(sessionSnapshot, selectedStudent.studentId) ? !isOfficialAutoMatched ? /*#__PURE__*/ _jsxs("label", {
                            className: "field",
                            children: [
                                /*#__PURE__*/ _jsx("span", {
                                    children: "Nhập mật khẩu của bạn"
                                }),
                                /*#__PURE__*/ _jsx("input", {
                                    className: "text-input",
                                    type: "password",
                                    value: enteredPassword,
                                    onChange: (event)=>setEnteredPassword(event.target.value),
                                    placeholder: "Nhập mật khẩu đ\xe3 tạo"
                                })
                            ]
                        }) : /*#__PURE__*/ _jsx("p", {
                            className: "hint-copy",
                            children: "Bạn c\xf3 thể bấm Bắt đầu ngay để v\xe0o ph\xf2ng chờ."
                        }) : /*#__PURE__*/ _jsxs("div", {
                            className: "group-password-setup",
                            children: [
                                /*#__PURE__*/ _jsxs("label", {
                                    className: "field",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            children: "Tạo mật khẩu (lần đầu v\xe0o phi\xean)"
                                        }),
                                        /*#__PURE__*/ _jsx("input", {
                                            className: "text-input",
                                            type: "password",
                                            value: newPassword,
                                            onChange: (event)=>setNewPassword(event.target.value),
                                            placeholder: "Tối thiểu 4 k\xfd tự"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("label", {
                                    className: "field",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            children: "Nhập lại mật khẩu"
                                        }),
                                        /*#__PURE__*/ _jsx("input", {
                                            className: "text-input",
                                            type: "password",
                                            value: confirmPassword,
                                            onChange: (event)=>setConfirmPassword(event.target.value),
                                            placeholder: "X\xe1c nhận mật khẩu"
                                        })
                                    ]
                                })
                            ]
                        }) : null,
                        /*#__PURE__*/ _jsx("button", {
                            type: "button",
                            className: "primary-button",
                            onClick: handleStartWaiting,
                            children: "Bắt đầu"
                        })
                    ]
                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "status-box",
                            children: [
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-label",
                                    children: "Trạng th\xe1i hiện tại"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-value",
                                    children: currentRoundLabel
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    className: "hint-copy",
                                    children: roundHint(currentRoundLabel)
                                })
                            ]
                        }),
                        isRound2Active || isRound3Active || isRound4Active && !isRound4Completed ? /*#__PURE__*/ _jsxs("div", {
                            className: "status-box",
                            children: [
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-label",
                                    children: "Kết quả V\xf2ng 1"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-value",
                                    children: role === "leader" ? "Bạn là Nhóm trưởng." : role === "member" ? "Bạn là Thành viên." : "Đang chờ Giảng viên công bố vai trò."
                                })
                            ]
                        }) : null,
                        isRound1Active ? /*#__PURE__*/ _jsxs("div", {
                            className: "status-box",
                            children: [
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-label",
                                    children: "B\xecnh chọn V\xf2ng 1"
                                }),
                                submittedRound1Votes.length === requiredRound1VoteCount ? /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-value",
                                            children: "Bạn đ\xe3 gửi b\xecnh chọn v\xe0 hiện đ\xe3 bị kh\xf3a."
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "group-student-list",
                                            style: {
                                                marginTop: 12
                                            },
                                            children: submittedRound1Votes.map((studentId, index)=>{
                                                const participant = sessionSnapshot.participants.find((item)=>item.studentId === studentId);
                                                return /*#__PURE__*/ _jsx("div", {
                                                    className: "group-student-item",
                                                    children: /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            index + 1,
                                                            ". ",
                                                            participant?.fullName || studentId
                                                        ]
                                                    })
                                                }, studentId);
                                            })
                                        })
                                    ]
                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsxs("p", {
                                            className: "hint-copy",
                                            style: {
                                                marginTop: 0,
                                                marginBottom: 12
                                            },
                                            children: [
                                                "V\xf2ng 1: h\xe3y chọn ",
                                                requiredRound1VoteCount,
                                                " sinh vi\xean kh\xe1c nhau để đề cử l\xe0m Nh\xf3m trưởng."
                                            ]
                                        }),
                                        Array.from({
                                            length: requiredRound1VoteCount
                                        }).map((_, index)=>/*#__PURE__*/ _jsxs("label", {
                                                className: "field",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            "Lựa chọn ",
                                                            index + 1
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("select", {
                                                        className: "text-input",
                                                        value: voteTargetIds[index] || "",
                                                        onChange: (event)=>handleRound1VoteChange(index, event.target.value),
                                                        children: [
                                                            /*#__PURE__*/ _jsx("option", {
                                                                value: "",
                                                                children: "-- Chọn một sinh vi\xean --"
                                                            }),
                                                            sessionSnapshot.participants.filter((participant)=>{
                                                                const chosenInOtherSlot = voteTargetIds.some((value, voteIndex)=>voteIndex !== index && value === participant.studentId);
                                                                return !chosenInOtherSlot;
                                                            }).map((participant)=>/*#__PURE__*/ _jsx("option", {
                                                                    value: participant.studentId,
                                                                    children: participant.fullName
                                                                }, participant.studentId))
                                                        ]
                                                    })
                                                ]
                                            }, `round1-vote-${index}`)),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            className: "primary-button",
                                            onClick: handleSubmitRound1Vote,
                                            children: "Gửi b\xecnh chọn V\xf2ng 1"
                                        })
                                    ]
                                })
                            ]
                        }) : null,
                        isRound2Active ? /*#__PURE__*/ _jsxs("div", {
                            className: "status-box",
                            children: [
                                /*#__PURE__*/ _jsx("p", {
                                    className: "status-label",
                                    children: "V\xf2ng 2"
                                }),
                                role === "member" ? submittedMemberPreferences.length === round2MemberChoiceCount && round2MemberChoiceCount > 0 ? /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-value",
                                            children: "Bạn đ\xe3 gửi nguyện vọng v\xe0 hiện đ\xe3 bị kh\xf3a."
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "group-student-list",
                                            style: {
                                                marginTop: 12
                                            },
                                            children: submittedMemberPreferences.map((leaderId, index)=>{
                                                const leader = sessionSnapshot.participants.find((item)=>item.studentId === leaderId);
                                                return /*#__PURE__*/ _jsx("div", {
                                                    className: "group-student-item",
                                                    children: /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            "NV",
                                                            index + 1,
                                                            ": ",
                                                            leader?.fullName || leaderId
                                                        ]
                                                    })
                                                }, `${leaderId}-${index}`);
                                            })
                                        })
                                    ]
                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsxs("p", {
                                            className: "hint-copy",
                                            style: {
                                                marginTop: 0,
                                                marginBottom: 12
                                            },
                                            children: [
                                                "Bạn l\xe0 Th\xe0nh vi\xean. Ở bước tiếp theo, bạn sẽ chọn ",
                                                round2MemberChoiceCount,
                                                " nguyện vọng Nh\xf3m trưởng."
                                            ]
                                        }),
                                        Array.from({
                                            length: round2MemberChoiceCount
                                        }).map((_, index)=>/*#__PURE__*/ _jsxs("label", {
                                                className: "field",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            "Nguyện vọng ",
                                                            index + 1
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("select", {
                                                        className: "text-input",
                                                        value: memberPreferenceIds[index] || "",
                                                        onChange: (event)=>{
                                                            const next = [
                                                                ...memberPreferenceIds
                                                            ];
                                                            next[index] = event.target.value;
                                                            setMemberPreferenceIds(next);
                                                        },
                                                        children: [
                                                            /*#__PURE__*/ _jsx("option", {
                                                                value: "",
                                                                children: "-- Chọn Nh\xf3m trưởng --"
                                                            }),
                                                            leaders.filter((leader)=>{
                                                                const selectedInOther = memberPreferenceIds.some((value, leaderIndex)=>leaderIndex !== index && value === leader?.studentId);
                                                                return !selectedInOther;
                                                            }).map((leader)=>/*#__PURE__*/ _jsx("option", {
                                                                    value: leader?.studentId,
                                                                    children: leader?.fullName
                                                                }, leader?.studentId))
                                                        ]
                                                    })
                                                ]
                                            }, `round2-member-${index}`)),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            className: "primary-button",
                                            onClick: handleSubmitRound2MemberPreference,
                                            children: "Gửi nguyện vọng V\xf2ng 2"
                                        })
                                    ]
                                }) : role === "leader" ? submittedLeaderRankings.length === leaderQuota && leaderQuota > 0 ? /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-value",
                                            children: "Bạn đ\xe3 gửi danh s\xe1ch ưu ti\xean v\xe0 hiện đ\xe3 bị kh\xf3a."
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            className: "group-student-list",
                                            style: {
                                                marginTop: 12
                                            },
                                            children: submittedLeaderRankings.map((memberId, index)=>{
                                                const member = sessionSnapshot.participants.find((item)=>item.studentId === memberId);
                                                return /*#__PURE__*/ _jsx("div", {
                                                    className: "group-student-item",
                                                    children: /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            index + 1,
                                                            ". ",
                                                            member?.fullName || memberId
                                                        ]
                                                    })
                                                }, `${memberId}-${index}`);
                                            })
                                        })
                                    ]
                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsxs("p", {
                                            className: "hint-copy",
                                            style: {
                                                marginTop: 0,
                                                marginBottom: 12
                                            },
                                            children: [
                                                "Bạn l\xe0 Nh\xf3m trưởng. Ở v\xf2ng tiếp theo, bạn cần chọn ra ",
                                                leaderQuota,
                                                " th\xe0nh vi\xean theo nguyện vọng của m\xecnh v\xe0 sắp xếp theo thứ tự ưu ti\xean."
                                            ]
                                        }),
                                        Array.from({
                                            length: leaderQuota
                                        }).map((_, index)=>/*#__PURE__*/ _jsxs("label", {
                                                className: "field",
                                                children: [
                                                    /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            "Ưu ti\xean ",
                                                            index + 1
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("select", {
                                                        className: "text-input",
                                                        value: leaderRankingIds[index] || "",
                                                        onChange: (event)=>{
                                                            const next = Array.from({
                                                                length: leaderQuota
                                                            }, (_, slot)=>leaderRankingIds[slot] || "");
                                                            next[index] = event.target.value;
                                                            setLeaderRankingIds(next);
                                                        },
                                                        children: [
                                                            /*#__PURE__*/ _jsx("option", {
                                                                value: "",
                                                                children: "-- Chọn Th\xe0nh vi\xean --"
                                                            }),
                                                            memberIds.filter((memberId)=>{
                                                                const selectedInOther = leaderRankingIds.some((value, memberIndex)=>memberIndex !== index && value === memberId);
                                                                return !selectedInOther;
                                                            }).map((memberId)=>{
                                                                const member = sessionSnapshot.participants.find((item)=>item.studentId === memberId);
                                                                return /*#__PURE__*/ _jsx("option", {
                                                                    value: memberId,
                                                                    children: member?.fullName || memberId
                                                                }, memberId);
                                                            })
                                                        ]
                                                    })
                                                ]
                                            }, `round2-leader-${index}`)),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            className: "primary-button",
                                            onClick: handleSubmitRound2LeaderRanking,
                                            children: "Gửi danh s\xe1ch ưu ti\xean V\xf2ng 2"
                                        })
                                    ]
                                }) : /*#__PURE__*/ _jsx("p", {
                                    className: "hint-copy",
                                    children: "Vui l\xf2ng chờ Giảng vi\xean c\xf4ng bố kết quả V\xf2ng 1 để x\xe1c định vai tr\xf2."
                                })
                            ]
                        }) : null,
                        isRound3Active ? /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                round2ResultBlock,
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "status-box",
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-label",
                                            children: "V\xf2ng 3"
                                        }),
                                        role === "leader" ? /*#__PURE__*/ _jsxs(_Fragment, {
                                            children: [
                                                /*#__PURE__*/ _jsxs("label", {
                                                    className: "field",
                                                    children: [
                                                        /*#__PURE__*/ _jsx("span", {
                                                            children: "Đặt t\xean ph\xf2ng"
                                                        }),
                                                        /*#__PURE__*/ _jsx("textarea", {
                                                            className: "text-input group-room-name-input",
                                                            value: roomName,
                                                            onChange: (event)=>setRoomName(event.target.value),
                                                            placeholder: "V\xed dụ: Ph\xf2ng thi\xean về chiến lược, th\xedch l\xe0m việc chắc tay v\xe0 quan t\xe2m kết quả l\xe2u d\xe0i",
                                                            disabled: isRoomNameLocked
                                                        })
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "hint-copy",
                                                    style: {
                                                        marginTop: -4
                                                    },
                                                    children: "Gợi \xfd: t\xean ph\xf2ng n\xean mang t\xednh m\xf4 tả, n\xf3i l\xean mục ti\xeau hoặc kh\xed chất nh\xf3m, tr\xe1nh d\xf9ng t\xean thật hay manh mối lộ danh t\xednh Nh\xf3m trưởng."
                                                }),
                                                isRoomNameLocked ? /*#__PURE__*/ _jsx("p", {
                                                    className: "hint-copy",
                                                    children: "T\xean ph\xf2ng đ\xe3 được chốt v\xe0 kh\xf4ng thể sửa nữa."
                                                }) : /*#__PURE__*/ _jsx("button", {
                                                    type: "button",
                                                    className: "primary-button",
                                                    onClick: handleSaveRound3Room,
                                                    children: "Lưu t\xean ph\xf2ng"
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "status-box",
                                                    style: {
                                                        marginTop: 16
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "status-label",
                                                            children: "Thư xin gia nhập đang chờ xử l\xfd"
                                                        }),
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "group-countdown-red",
                                                            style: {
                                                                marginTop: 0,
                                                                marginBottom: 12
                                                            },
                                                            children: "Mỗi thư đều c\xf3 thời gian hiển thị đếm ngược. Hết giờ hệ thống sẽ tự động từ chối."
                                                        }),
                                                        pendingLeaderApplications.length > 0 ? /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-list",
                                                            children: pendingLeaderApplications.map((application, index)=>/*#__PURE__*/ _jsxs("div", {
                                                                    className: "group-student-item",
                                                                    children: [
                                                                        /*#__PURE__*/ _jsxs("span", {
                                                                            children: [
                                                                                "Ứng vi\xean ẩn danh #",
                                                                                index + 1
                                                                            ]
                                                                        }),
                                                                        /*#__PURE__*/ _jsxs("small", {
                                                                            className: "group-countdown-red",
                                                                            children: [
                                                                                "C\xf2n lại:",
                                                                                " ",
                                                                                formatCountdown(application.submittedAtMs + application.visibleDurationMs - Date.now())
                                                                            ]
                                                                        }),
                                                                        /*#__PURE__*/ _jsx("small", {
                                                                            style: {
                                                                                whiteSpace: "pre-wrap"
                                                                            },
                                                                            children: application.applicationLetter
                                                                        }),
                                                                        /*#__PURE__*/ _jsxs("div", {
                                                                            className: "group-action-row",
                                                                            children: [
                                                                                /*#__PURE__*/ _jsx("button", {
                                                                                    type: "button",
                                                                                    className: "hero-primary group-inline-action",
                                                                                    onClick: ()=>handleReviewApplication(application.applicantStudentId, "accepted"),
                                                                                    disabled: reviewingApplicantId === application.applicantStudentId,
                                                                                    children: "Đồng \xfd"
                                                                                }),
                                                                                /*#__PURE__*/ _jsx("button", {
                                                                                    type: "button",
                                                                                    className: "hero-secondary group-inline-action",
                                                                                    onClick: ()=>handleReviewApplication(application.applicantStudentId, "rejected"),
                                                                                    disabled: reviewingApplicantId === application.applicantStudentId,
                                                                                    children: "Từ chối"
                                                                                })
                                                                            ]
                                                                        })
                                                                    ]
                                                                }, `${application.applicantStudentId}-${index}`))
                                                        }) : /*#__PURE__*/ _jsx("p", {
                                                            className: "hint-copy",
                                                            children: "Hiện chưa c\xf3 thư n\xe0o đang chờ bạn đọc."
                                                        })
                                                    ]
                                                }),
                                                currentLeaderRoom ? /*#__PURE__*/ _jsxs("div", {
                                                    className: "status-box",
                                                    style: {
                                                        marginTop: 16
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "status-label",
                                                            children: "Th\xe0nh vi\xean hiện c\xf3 trong ph\xf2ng"
                                                        }),
                                                        /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-list",
                                                            children: [
                                                                ...currentLeaderRoom.observerMemberIds || [],
                                                                ...currentLeaderRoom.admittedMemberIds || []
                                                            ].filter((studentId, index, list)=>list.indexOf(studentId) === index).map((studentId)=>{
                                                                const participant = sessionSnapshot.participants.find((item)=>item.studentId === studentId);
                                                                return /*#__PURE__*/ _jsx("div", {
                                                                    className: "group-student-item",
                                                                    children: /*#__PURE__*/ _jsx("span", {
                                                                        children: participant?.fullName || studentId
                                                                    })
                                                                }, studentId);
                                                            })
                                                        })
                                                    ]
                                                }) : null
                                            ]
                                        }) : /*#__PURE__*/ _jsx(_Fragment, {
                                            children: isMatchedInRound2 || myApplication?.status === "accepted" ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                children: [
                                                    /*#__PURE__*/ _jsx("p", {
                                                        className: "status-value",
                                                        children: myApplication?.status === "accepted" ? "Thư của bạn đã được chấp nhận. Bạn đang ở phòng quan sát." : "Bạn đã có phòng từ kết quả Vòng 2 và chỉ theo dõi ở vai trò quan sát."
                                                    }),
                                                    myObservedRoom ? /*#__PURE__*/ _jsxs("p", {
                                                        className: "hint-copy",
                                                        style: {
                                                            marginTop: 8
                                                        },
                                                        children: [
                                                            "Ph\xf2ng hiện tại: ",
                                                            /*#__PURE__*/ _jsx("strong", {
                                                                children: myObservedRoom.roomName || "Chưa đặt tên"
                                                            }),
                                                            "."
                                                        ]
                                                    }) : null
                                                ]
                                            }) : myApplication?.status === "pending" ? /*#__PURE__*/ _jsx("p", {
                                                className: "hint-copy",
                                                children: "Bạn đ\xe3 gửi thư 1 lần v\xe0 đang chờ Nh\xf3m trưởng duyệt. Bạn kh\xf4ng thể sửa hoặc gửi lại thư."
                                            }) : myApplication?.status === "rejected" || myApplication?.status === "expired" ? /*#__PURE__*/ _jsx("p", {
                                                className: "hint-copy",
                                                children: myApplication.status === "expired" ? "Thư của bạn đã quá thời gian hiển thị và tự động bị từ chối. Bạn đang ở Đảo hoang để chờ random fill ở Vòng 4." : "Thư của bạn đã bị từ chối. Bạn đang ở Đảo hoang để chờ random fill ở Vòng 4."
                                            }) : /*#__PURE__*/ _jsx(_Fragment, {
                                                children: !allRequiredRoomsCreated ? /*#__PURE__*/ _jsxs("p", {
                                                    className: "hint-copy",
                                                    children: [
                                                        "Đang chờ Nh\xf3m trưởng tạo đủ ph\xf2ng (",
                                                        createdRoomCount,
                                                        "/",
                                                        requiredRoomCount,
                                                        "). Th\xe0nh vi\xean sẽ được chọn ph\xf2ng v\xe0 viết thư ngay sau khi đủ ph\xf2ng."
                                                    ]
                                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                                    children: [
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "hint-copy",
                                                            style: {
                                                                marginTop: 0,
                                                                marginBottom: 12
                                                            },
                                                            children: "Chọn 1 ph\xf2ng muốn tham gia trước, sau đ\xf3 viết thư xin gia nhập."
                                                        }),
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "group-countdown-red",
                                                            style: {
                                                                marginTop: -4,
                                                                marginBottom: 12
                                                            },
                                                            children: isAfterRound3ComposeLimit ? "Đã quá 5 phút viết thư. Nếu gửi lúc này, thư chỉ hiển thị 3 phút ở phòng Nhóm trưởng." : `Bạn còn ${round3ComposeRemainingMinutesLabel} để hoàn thành thư. Thư đúng hạn sẽ hiển thị 5 phút ở phòng Nhóm trưởng.`
                                                        }),
                                                        /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-list",
                                                            style: {
                                                                marginBottom: 12
                                                            },
                                                            children: leaders.map((leader)=>{
                                                                const room = sessionSnapshot.round3Rooms?.[leader?.studentId || ""];
                                                                const roomCapacity = getLeaderCapacity(sessionSnapshot, leader?.studentId || "");
                                                                const roomMemberIds = [
                                                                    ...room?.observerMemberIds || [],
                                                                    ...room?.admittedMemberIds || []
                                                                ].filter((studentId, index, list)=>list.indexOf(studentId) === index);
                                                                const roomIsFull = roomMemberIds.length >= roomCapacity;
                                                                const isSelected = selectedTargetLeaderId === leader?.studentId;
                                                                return /*#__PURE__*/ _jsxs("button", {
                                                                    type: "button",
                                                                    className: isSelected ? "group-student-item group-room-option selected" : "group-student-item group-room-option",
                                                                    style: {
                                                                        textAlign: "left",
                                                                        cursor: roomIsFull ? "not-allowed" : "pointer",
                                                                        opacity: roomIsFull ? 0.65 : 1
                                                                    },
                                                                    onClick: ()=>{
                                                                        if (!roomIsFull) {
                                                                            setSelectedTargetLeaderId(leader?.studentId || "");
                                                                        }
                                                                    },
                                                                    disabled: roomIsFull,
                                                                    children: [
                                                                        /*#__PURE__*/ _jsx("span", {
                                                                            children: room?.roomName?.trim() || "Phòng đang chờ nhóm trưởng đặt tên"
                                                                        }),
                                                                        /*#__PURE__*/ _jsxs("small", {
                                                                            children: [
                                                                                "Đang c\xf3 ",
                                                                                roomMemberIds.length,
                                                                                "/",
                                                                                roomCapacity,
                                                                                " th\xe0nh vi\xean",
                                                                                roomIsFull ? " · Đã đầy" : ""
                                                                            ]
                                                                        })
                                                                    ]
                                                                }, leader?.studentId);
                                                            })
                                                        }),
                                                        selectedTargetLeaderId ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                            children: [
                                                                /*#__PURE__*/ _jsxs("label", {
                                                                    className: "field",
                                                                    children: [
                                                                        /*#__PURE__*/ _jsx("span", {
                                                                            children: "Thư xin gia nhập"
                                                                        }),
                                                                        /*#__PURE__*/ _jsx("textarea", {
                                                                            className: "text-input group-textarea",
                                                                            value: applicationLetter,
                                                                            onChange: (event)=>setApplicationLetter(event.target.value),
                                                                            placeholder: "H\xe3y viết r\xf5 v\xec sao bạn muốn v\xe0o ph\xf2ng n\xe0y, bạn c\xf3 thể đ\xf3ng g\xf3p g\xec v\xe0 bạn c\xf3 cam kết g\xec trong việc l\xe0m việc nh\xf3m nếu được v\xe0o."
                                                                        })
                                                                    ]
                                                                }),
                                                                /*#__PURE__*/ _jsx("p", {
                                                                    className: "hint-copy",
                                                                    style: {
                                                                        marginTop: -4
                                                                    },
                                                                    children: "H\xe3y viết r\xf5 v\xec sao bạn muốn v\xe0o ph\xf2ng n\xe0y, bạn c\xf3 thể đ\xf3ng g\xf3p g\xec v\xe0 bạn c\xf3 cam kết g\xec trong việc l\xe0m việc nh\xf3m nếu được v\xe0o."
                                                                }),
                                                                /*#__PURE__*/ _jsx("button", {
                                                                    type: "button",
                                                                    className: "primary-button",
                                                                    onClick: handleSubmitRound3Application,
                                                                    children: "Gửi thư xin gia nhập"
                                                                })
                                                            ]
                                                        }) : /*#__PURE__*/ _jsx("p", {
                                                            className: "hint-copy",
                                                            children: "Vui l\xf2ng chọn ph\xf2ng trước khi viết thư."
                                                        })
                                                    ]
                                                })
                                            })
                                        })
                                    ]
                                })
                            ]
                        }) : null,
                        isRound4Active ? /*#__PURE__*/ _jsxs(_Fragment, {
                            children: [
                                !isRound4Completed ? round2ResultBlock : null,
                                !isRound4Completed ? /*#__PURE__*/ _jsxs("div", {
                                    className: "status-box",
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-label",
                                            children: "Kết quả V\xf2ng 3"
                                        }),
                                        round3AssignedGroup ? /*#__PURE__*/ _jsxs(_Fragment, {
                                            children: [
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "status-value",
                                                    children: round3AssignedGroup.leaderStudentId === joinedStudentId ? "Bạn là Nhóm trưởng của nhóm này." : `Bạn thuộc nhóm của Nhóm trưởng ${round3AssignedGroup.leaderFullName}.`
                                                }),
                                                /*#__PURE__*/ _jsxs("p", {
                                                    className: "hint-copy",
                                                    style: {
                                                        marginTop: 4
                                                    },
                                                    children: [
                                                        "Ph\xf2ng: ",
                                                        round3AssignedGroup.roomName || "Chưa đặt tên"
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "group-student-list",
                                                    style: {
                                                        marginTop: 12
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-item",
                                                            children: /*#__PURE__*/ _jsxs("span", {
                                                                children: [
                                                                    "Nh\xf3m trưởng: ",
                                                                    round3AssignedGroup.leaderFullName
                                                                ]
                                                            })
                                                        }),
                                                        round3AssignedGroup.memberFullNames.length > 0 ? round3AssignedGroup.memberFullNames.map((fullName, index)=>/*#__PURE__*/ _jsx("div", {
                                                                className: "group-student-item",
                                                                children: /*#__PURE__*/ _jsx("span", {
                                                                    children: fullName
                                                                })
                                                            }, `${fullName}-${index}`)) : /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-item",
                                                            children: /*#__PURE__*/ _jsx("span", {
                                                                children: "Bạn chưa c\xf3 bất k\xec th\xe0nh vi\xean n\xe0o."
                                                            })
                                                        })
                                                    ]
                                                })
                                            ]
                                        }) : /*#__PURE__*/ _jsx("p", {
                                            className: "status-value",
                                            children: "Bạn vẫn chưa thuộc về nh\xf3m n\xe0o, vui l\xf2ng chờ GV mở v\xf2ng tiếp theo để tự động xếp v\xe0o nh\xf3m ngẫu nhi\xean đang c\xf2n trống."
                                        })
                                    ]
                                }) : null,
                                isRound4Completed ? /*#__PURE__*/ _jsxs("div", {
                                    className: "status-box",
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-label",
                                            children: "Kết quả V\xf2ng 4 (Random fill)"
                                        }),
                                        finalAssignedGroup ? /*#__PURE__*/ _jsxs(_Fragment, {
                                            children: [
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "status-value",
                                                    children: finalAssignedGroup.leaderStudentId === joinedStudentId ? "Bạn là Nhóm trưởng của nhóm này." : `Bạn thuộc nhóm của Nhóm trưởng ${finalAssignedGroup.leaderFullName}.`
                                                }),
                                                /*#__PURE__*/ _jsxs("p", {
                                                    className: "hint-copy",
                                                    style: {
                                                        marginTop: 4
                                                    },
                                                    children: [
                                                        "Ph\xf2ng: ",
                                                        finalAssignedGroup.roomName || "Chưa đặt tên"
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "group-student-list",
                                                    style: {
                                                        marginTop: 12
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-item",
                                                            children: /*#__PURE__*/ _jsxs("span", {
                                                                children: [
                                                                    "Nh\xf3m trưởng: ",
                                                                    finalAssignedGroup.leaderFullName
                                                                ]
                                                            })
                                                        }),
                                                        finalAssignedGroup.memberFullNames.length > 0 ? finalAssignedGroup.memberFullNames.map((fullName, index)=>/*#__PURE__*/ _jsx("div", {
                                                                className: "group-student-item",
                                                                children: /*#__PURE__*/ _jsx("span", {
                                                                    children: fullName
                                                                })
                                                            }, `${fullName}-${index}`)) : /*#__PURE__*/ _jsx("div", {
                                                            className: "group-student-item",
                                                            children: /*#__PURE__*/ _jsx("span", {
                                                                children: "Bạn chưa c\xf3 bất k\xec th\xe0nh vi\xean n\xe0o."
                                                            })
                                                        })
                                                    ]
                                                })
                                            ]
                                        }) : /*#__PURE__*/ _jsx("p", {
                                            className: "status-value",
                                            children: "Tr\xf2 chơi đ\xe3 kết th\xfac."
                                        })
                                    ]
                                }) : /*#__PURE__*/ _jsxs("div", {
                                    className: "status-box",
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "status-label",
                                            children: "V\xf2ng 4"
                                        }),
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "hint-copy",
                                            children: "Đang chờ GV bấm bắt đầu random fill để ho\xe0n tất chia nh\xf3m."
                                        })
                                    ]
                                })
                            ]
                        }) : null
                    ]
                }),
                statusMessage ? /*#__PURE__*/ _jsx("p", {
                    className: "group-status-note",
                    children: statusMessage
                }) : null
            ]
        })
    });
}

