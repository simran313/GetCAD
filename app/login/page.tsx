import { redirect } from "next/navigation";

/** /login (docs/design S1, the website's links) is the sign-in screen at /sign-in. */
export default function LoginRedirect(): never {
  redirect("/sign-in");
}
