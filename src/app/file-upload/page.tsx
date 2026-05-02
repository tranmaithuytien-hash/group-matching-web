import { redirect } from "next/navigation";

export default function LegacyFileUploadRedirect() {
  redirect("/files");
}
