import {
  appendTopicSessionLog,
  finalizeType1BiddingWithRandom,
  resolveBiddingRound,
  respondGroup3Wave,
  respondWave,
  saveType1BidDraft,
  sendGroup3Wave,
  sendWave,
  shouldResolveType1Bidding,
  startBiddingType1,
  startTopicSession,
  submitBid,
  teacherMoveType1ToGroup3,
  randomFillType1,
  setType1BidApproval,
  type TopicSession,
  type TopicStudent
} from "../src/lib/topic-picker";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const memoryStorage = new MemoryStorage();
(globalThis as any).window = { localStorage: memoryStorage };

function assertCase(name: string, ok: boolean, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} | ${name}${detail ? ` | ${detail}` : ""}`);
  return ok;
}

function mkStudents(): TopicStudent[] {
  return [
    { studentId: "s1", fullName: "SV 1", scoreValue: 9 },
    { studentId: "s2", fullName: "SV 2", scoreValue: 8 },
    { studentId: "s3", fullName: "SV 3", scoreValue: 7 },
    { studentId: "s4", fullName: "SV 4", scoreValue: 6 },
    { studentId: "s5", fullName: "SV 5", scoreValue: 8.5 },
    { studentId: "s6", fullName: "SV 6", scoreValue: 5 }
  ];
}

function baseSession(): TopicSession {
  const now = Date.now();
  return {
    id: "sess-1",
    classCode: "M2ZVBB",
    ownerTeacherEmail: "t@demo.edu",
    ownerTeacherName: "Teacher",
    subjectName: "MAR2023",
    classListId: "c1",
    className: "Demo",
    topics: ["Chu de 1", "Chu de 2", "Chu de 3"],
    topicCount: 3,
    groupsOf2: 0,
    groupsOf3: 2,
    type: 1,
    scoreColumn: "ranking",
    students: mkStudents(),
    credentialsByStudentId: {},
    finalGroups: [],
    status: "preparing",
    type1Stage: "pairing",
    type1PairingDurationMinutes: 1,
    type1PairingEndsAt: 0,
    type1Group3EndsAt: 0,
    type1RoundEndsAt: 0,
    workingGroups: [],
    waveRequests: [],
    biddingRound: 1,
    bidRecords: [],
    groupRemainingPoints: {},
    type1BidDraftByGroupId: {},
    type1BidApprovalsByGroupId: {},
    type1PenaltyPoints: 30,
    type1PenalizedGroupIds: [],
    type1TopRemainingGroupId: "",
    topic2RoomMembers: {},
    topic2LockedTopics: [],
    topic2MessagesByTopic: {},
    topic2AgreementByTopic: {},
    topic2LockSourceByTopic: {},
    topic2DurationMinutes: 10,
    topic2EndsAt: 0,
    topic2FinalizedAt: 0,
    actionLogs: [],
    createdAt: now,
    updatedAt: now
  };
}

let s = startTopicSession(baseSession());
assertCase("Start session -> running", s.status === "running" && s.type1Stage === "pairing");

s = sendWave(s, "s1", "s2");
s = respondWave(s, "s2", "s1", true);
assertCase("Pair accepted creates group", (s.workingGroups || []).length === 1);

const beforeDup = s.waveRequests?.length || 0;
s = sendWave(s, "s1", "s3");
assertCase("Grouped student cannot send new wave", (s.waveRequests?.length || 0) === beforeDup);

s = sendWave(s, "s3", "s4");
s = respondWave(s, "s4", "s3", true);
assertCase("Second pair created", (s.workingGroups || []).length === 2);

s = teacherMoveType1ToGroup3(s);
assertCase("Move to group3 stage", s.type1Stage === "group3");

// s5 asks to join leader group
const leaderG1 = s.workingGroups?.[0]?.memberStudentIds[0] || "s1";
s = sendGroup3Wave(s, "s5", leaderG1);
s = respondGroup3Wave(s, leaderG1, "s5", true);
const g1 = s.workingGroups?.find(g => g.memberStudentIds.includes("s1"));
assertCase("Group3 accept adds third member", !!g1 && g1.memberStudentIds.length === 3);

// force group3 end and random fill remaining
s = { ...s, type1Group3EndsAt: Date.now() - 1000 };
s = randomFillType1(s);
const allGrouped = s.students.every(st => (s.workingGroups || []).some(g => g.memberStudentIds.includes(st.studentId)));
assertCase("Random fill completes grouping", allGrouped);

s = startBiddingType1(s);
assertCase("Start bidding round 1 with 5-min timer", s.type1Stage === "bidding" && (s.type1RoundEndsAt || 0) > Date.now());

const groups = s.workingGroups || [];
const gA = groups[0];
const gB = groups[1];
const leaderA = gA.memberStudentIds[0];
const leaderB = gB.memberStudentIds[0];

s = saveType1BidDraft(s, gA.id, leaderA, "Chu de 1", 10);
s = setType1BidApproval(s, gA.id, gA.memberStudentIds[1], true);
if (gA.memberStudentIds[2]) s = setType1BidApproval(s, gA.id, gA.memberStudentIds[2], true);
s = submitBid(s, gA.id, "Chu de 1", 10);
assertCase("Leader draft + approvals + submit works", (s.bidRecords || []).some(b => b.groupId === gA.id && b.round === 1));

const countAfterSubmit = (s.bidRecords || []).length;
s = submitBid(s, gA.id, "Chu de 2", 5);
assertCase("One decision per group per round", (s.bidRecords || []).length === countAfterSubmit);

const remainB = s.groupRemainingPoints?.[gB.id] || 0;
s = saveType1BidDraft(s, gB.id, leaderB, "Chu de 2", remainB); // all-in
s = setType1BidApproval(s, gB.id, gB.memberStudentIds[1], true);
if (gB.memberStudentIds[2]) s = setType1BidApproval(s, gB.id, gB.memberStudentIds[2], true);
s = submitBid(s, gB.id, "Chu de 2", remainB);
assertCase("All-in bid accepted (points == remaining)", (s.bidRecords || []).some(b => b.groupId === gB.id && b.points === remainB));

assertCase("Auto resolve condition true when all active submitted", shouldResolveType1Bidding(s) === true);
s = resolveBiddingRound(s);
assertCase("Resolve round assigns winners or advances", (s.finalGroups || []).length >= 1);

if (s.type1Stage === "bidding") {
  // force timeout in next round and check auto condition
  s = { ...s, type1RoundEndsAt: Date.now() - 1000 };
  assertCase("Auto resolve on timeout", shouldResolveType1Bidding(s) === true);
}

s = finalizeType1BiddingWithRandom(s);
assertCase("Finalize random closes game", s.status === "completed" && s.type1Stage === "completed");
assertCase("Every group gets a final topic", (s.finalGroups || []).length === (s.workingGroups || []).length);

const winnerBonus = Boolean(s.type1TopRemainingGroupId);
assertCase("Top remaining group tracked for +0.5 bonus", winnerBonus);

s = appendTopicSessionLog(s, "Smoke test", "Completed");
assertCase("Action log append works", (s.actionLogs || []).length > 0);
