import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";

export function classDocRef(classId: string) {
  return doc(db, "classes", classId);
}

export function classAppStateRef(classId: string) {
  return doc(db, "classes", classId, "app_state", "current");
}

export function classParticipantsCollection(classId: string) {
  return collection(db, "classes", classId, "participants");
}

export function classParticipantDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "participants", studentId);
}

export function classRound1VotesCollection(classId: string) {
  return collection(db, "classes", classId, "round1_votes");
}

export function classRound1VoteDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "round1_votes", studentId);
}

export function classRound2MemberPreferencesCollection(classId: string) {
  return collection(db, "classes", classId, "round2_member_preferences");
}

export function classRound2MemberPreferenceDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "round2_member_preferences", studentId);
}

export function classRound2LeaderRankingsCollection(classId: string) {
  return collection(db, "classes", classId, "round2_leader_rankings");
}

export function classRound2LeaderRankingDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "round2_leader_rankings", studentId);
}

export function classRound3RoomsCollection(classId: string) {
  return collection(db, "classes", classId, "round3_rooms");
}

export function classRound3RoomDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "round3_rooms", studentId);
}

export function classRound3ApplicationsCollection(classId: string) {
  return collection(db, "classes", classId, "round3_applications");
}

export function classRound3ApplicationDoc(classId: string, studentId: string) {
  return doc(db, "classes", classId, "round3_applications", studentId);
}

export function buildClassLink(classId: string) {
  return `/class/${classId}`;
}

export function teacherSelectedClassKey(uid: string) {
  return `teacherSelectedClassId:${uid}`;
}

export function activeClassIdKey() {
  return "activeClassId";
}

export function studentIdKey(classId: string) {
  return `selectedStudentId:${classId}`;
}

export function studentNameKey(classId: string) {
  return `selectedStudentName:${classId}`;
}

export function resetCounterKey(classId: string) {
  return `appResetCounter:${classId}`;
}

export function round1DraftKey(classId: string, studentId: string) {
  return `round1Draft:${classId}:${studentId}`;
}

export function round2MemberDraftKey(classId: string, studentId: string) {
  return `round2MemberDraft:${classId}:${studentId}`;
}

export function round2LeaderDraftKey(classId: string, studentId: string) {
  return `round2LeaderDraft:${classId}:${studentId}`;
}

export function round3RoomDraftKey(classId: string, studentId: string) {
  return `round3RoomDraft:${classId}:${studentId}`;
}

export function round3ApplicationDraftKey(classId: string, studentId: string) {
  return `round3ApplicationDraft:${classId}:${studentId}`;
}
