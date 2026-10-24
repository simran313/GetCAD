import { redirect } from "next/navigation";

/** /signup (docs/design S2, the website's links) is the sign-up screen at /sign-up. */
export default function SignupRedirect(): never {
  redirect("/sign-up");
}
