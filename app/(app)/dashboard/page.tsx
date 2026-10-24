import { redirect } from "next/navigation";

/** The client home moved to /home (Phase 5, owner answer Q13); old links still land. */
export default function DashboardRedirect(): never {
  redirect("/home");
}
