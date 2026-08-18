import Link from "next/link";
import { currentUser } from "@/server/auth/session";
import { Logo } from "./logo";

export async function PublicNav() {
  const user = await currentUser();
  return <header className="border-b border-white/7 bg-[#071019]/75 backdrop-blur-xl">
    <div className="container-page flex h-17 items-center justify-between">
      <Logo />
      <nav className="flex items-center gap-2" aria-label="Primary navigation">
        <Link href="/scenarios" className="btn border-transparent bg-transparent">Scenarios</Link>
        <Link href={user ? "/dashboard" : "/start"} className="btn btn-primary">{user ? <><span className="sm:hidden">Open</span><span className="hidden sm:inline">Open dashboard</span></> : <>Start<span className="hidden sm:inline"> simulation</span></>}</Link>
      </nav>
    </div>
  </header>;
}
