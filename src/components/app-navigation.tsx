"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, LayoutDashboard, Settings2 } from "lucide-react";
import { cn } from "@/lib/ui";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scenarios", label: "Scenarios", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings2 },
];
export function AppNavigation({ mobile=false }: { mobile?: boolean }) {
  const pathname=usePathname();
  return <nav aria-label={mobile?"Mobile navigation":"Application navigation"} className={cn(mobile?"grid grid-cols-3":"space-y-1")}>
    {links.map(({href,label,icon:Icon})=>{const active=pathname===href||pathname.startsWith(`${href}/`);return <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition",active?"bg-emerald-300/12 text-emerald-200":"text-slate-400 hover:bg-white/5 hover:text-white",mobile&&"flex-col gap-1 rounded-none py-2 text-[10px]")}><Icon size={mobile?18:17}/>{label}</Link>})}
  </nav>;
}
