import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageUsers } from "@/lib/access";
import { emailSettings } from "@/lib/email-config";
import { EmailTester } from "./email-tester";

/**
 * What the mail settings are, and whether they work.
 *
 * The settings themselves live in the environment, not in the database — they
 * are a property of the deployment, and a screen that let somebody type an SMTP
 * password into a form would put a credential in a table and a backup. So this
 * reads them and sends a test, which is the part that cannot be done from a
 * config file.
 */
export default async function EmailPage() {
  const user = await requireUser();
  if (!canManageUsers(user.role)) redirect("/");

  return <EmailTester settings={emailSettings()} suggested={user.email ?? ""} />;
}
