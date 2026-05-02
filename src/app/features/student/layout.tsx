import type { ReactNode } from "react";
import { StudentAuthGuard } from "../../../components/student-auth-guard";

export default function StudentFeaturesLayout({ children }: { children: ReactNode }) {
  return <StudentAuthGuard>{children}</StudentAuthGuard>;
}

