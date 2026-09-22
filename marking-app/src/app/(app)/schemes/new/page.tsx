import { requireViewer } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { SchemeEditor } from "@/components/scheme-editor";

export default async function NewSchemePage() {
  await requireViewer();
  return (
    <div className="space-y-6">
      <PageHeader
        title="New mark scheme"
        subtitle="One entry per question: what was asked, what the right answer is, and how to award part marks."
        backHref="/schemes"
        backLabel="Mark schemes"
      />
      <SchemeEditor />
    </div>
  );
}
