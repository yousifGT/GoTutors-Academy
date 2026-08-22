import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import type { Viewer } from "@/lib/access";

/** For pages: send anyone not signed in to the login screen. */
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * For API routes: the signed-in viewer, or a 401 to return.
 *
 *   const who = await viewerOr401();
 *   if ("response" in who) return who.response;
 *   who.viewer.role // ...
 */
export async function viewerOr401(): Promise<{ viewer: Viewer } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { response: NextResponse.json({ error: "unauth" }, { status: 401 }) };
  return { viewer: { id: session.user.id, role: session.user.role } };
}
