import { requireRole } from "@/lib/session";
import { ProfileCard } from "@/components/profile-card";

export default async function ProfilePage() {
  const session = await requireRole("SUPER_ADMIN");
  return <ProfileCard userId={session.user.id} />;
}
