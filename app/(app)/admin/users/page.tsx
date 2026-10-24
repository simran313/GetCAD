import { redirect } from "next/navigation";

/** Access moved to /admin/access (A4, Phase 5d); old links still land. */
export default function UsersRedirect() {
  redirect("/admin/access");
}
