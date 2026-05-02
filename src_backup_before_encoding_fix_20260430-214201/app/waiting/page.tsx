import WaitingClient from "./waiting-client";

type WaitingPageProps = {
  searchParams?: Promise<{
    code?: string;
    name?: string;
    studentId?: string;
  }>;
};

export default async function WaitingPage({ searchParams }: WaitingPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const classCode = resolvedSearchParams.code || "";
  const name = resolvedSearchParams.name || "Sinh viên";
  const studentId = resolvedSearchParams.studentId || "";

  return <WaitingClient classCode={classCode} initialName={name} initialStudentId={studentId} />;
}
