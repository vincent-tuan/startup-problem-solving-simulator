import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { StartForm } from "@/components/start-form";
import { currentUser } from "@/server/auth/session";

export const metadata = { title: "Start" };
export default async function StartPage() {
  if (await currentUser()) redirect("/dashboard");
  return <main className="container-page grid min-h-screen items-center gap-12 py-10 lg:grid-cols-[.85fr_1.15fr]">
    <section className="max-w-xl"><Logo/><div className="eyebrow mt-14">Secure by possession</div><h2 className="title-balance mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">One lightweight identity. Every decision saved.</h2><p className="muted mt-5 text-base leading-7">The simulator creates an anonymous cloud account and a private recovery code. There are no passwords, social logins, or email lookup.</p><div className="surface-soft mt-7 p-4 text-sm leading-6"><strong>Important:</strong> if you clear this browser and lose the recovery code, support cannot reconstruct access from your email.</div></section>
    <section className="mx-auto w-full max-w-xl"><StartForm/></section>
  </main>;
}
