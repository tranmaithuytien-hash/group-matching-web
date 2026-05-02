export default function StudentMaterialsPage() {
  // Keep page entry simple and delegate all client logic to a dedicated client component.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const StudentMaterialsClient = require("./student-materials-client").default;
  return <StudentMaterialsClient />;
}
