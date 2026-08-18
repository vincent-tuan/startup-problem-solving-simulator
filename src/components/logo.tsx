import Link from "next/link";
import { Orbit } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 font-extrabold tracking-[-.025em]">
    <span className="grid size-9 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-300"><Orbit size={19} /></span>
    {!compact && <span className="whitespace-nowrap"><span>FounderOS</span><span className="hidden sm:inline"> Simulator</span></span>}
  </Link>;
}
