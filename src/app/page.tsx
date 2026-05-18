import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, roleDashboard } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  redirect(roleDashboard[session.user.roleType]);
}
