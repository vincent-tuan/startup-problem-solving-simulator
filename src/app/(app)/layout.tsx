import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { currentUser } from "@/server/auth/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user=await currentUser();if(!user)redirect("/start");return <AppShell user={user}>{children}</AppShell>;
}
