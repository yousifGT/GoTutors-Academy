import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MARKER";
  organisationId: string;
};

/** The signed-in person, or a redirect to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    organisationId: session.user.organisationId,
  };
}

/** Admin-only pages. A marker is sent home rather than shown an error. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "ADMIN") redirect("/");
  return viewer;
}

/** Route flavour: the viewer, or null for the caller to turn into a 401. */
export async function viewerOrNull(): Promise<Viewer | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    organisationId: session.user.organisationId,
  };
}
