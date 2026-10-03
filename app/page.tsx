import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { getUserContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let context;
  try { context = await getUserContext(); } catch { redirect("/login"); }
  return <Workspace userEmail={context.user.email ?? ""} />;
}
