import { requireRole } from "@/lib/session";
import { ProfileCard } from "@/components/profile-card";

export default async function ProfilePage() {
  const session = await requireRole("CENTRE_ADMIN", "SUPER_ADMIN");
  return <ProfileCard userId={session.user.id} />;
}
