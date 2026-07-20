import { requireRole } from "@/lib/session";
import { ProfileCard } from "@/components/profile-card";
import { PageHeader } from "@/components/page-ui";

export default async function ProfilePage() {
  const session = await requireRole("TRAINEE", "SUPER_ADMIN", "INSTRUCTOR");
  return (
    <div className="space-y-5">
      <PageHeader title="My profile" subtitle="Your account details — only your phone number is editable here." />
      <ProfileCard userId={session.user.id} />
    </div>
  );
}
