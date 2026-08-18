import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { UserRecord } from "@/server/store";
import { AppNavigation } from "./app-navigation";
import { Logo } from "./logo";
import { SessionHeartbeat } from "./session-heartbeat";

export function AppShell({ user, children }: { user: UserRecord; children: React.ReactNode }) {
  return <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]"><SessionHeartbeat />
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/7 bg-[#08131d]/90 p-4 backdrop-blur-xl lg:flex lg:flex-col"><Logo/><div className="mt-10"><AppNavigation/></div><div className="mt-auto rounded-xl border border-white/8 bg-black/15 p-3"><div className="truncate text-sm font-bold">{user.displayName}</div><div className="muted mt-1 truncate text-xs">{user.contactEmail}</div><Link href="/settings" className="mt-3 flex items-center justify-between text-xs font-bold text-emerald-300">Session security <ChevronRight size={14}/></Link></div></aside>
    <main className="min-w-0 pb-22 lg:col-start-2 lg:pb-0">{children}</main>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/9 bg-[#071019]/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"><AppNavigation mobile/></div>
  </div>;
}
