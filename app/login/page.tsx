import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole, PencilRuler } from "lucide-react";
import LoginForm from "@/components/login-form";
import { HttpError } from "@/lib/http";
import { getAuthConfiguration } from "@/lib/supabase/config";
import { getUserContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let setupMessage = "";
  let turnstileSiteKey = "";
  try { turnstileSiteKey = getAuthConfiguration().turnstileSiteKey; } catch (error) {
    setupMessage = error instanceof HttpError ? error.message : "Sign-in is temporarily unavailable.";
  }
  let signedIn = false;
  if (!setupMessage) {
    try { await getUserContext(); signedIn = true; } catch { /* Show sign-in. */ }
  }
  if (signedIn) redirect("/");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-12 text-slate-900">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-8 flex items-center gap-3 text-xl font-semibold"><span className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><PencilRuler size={24} /></span> Inkspace</div>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700"><LockKeyhole size={21} /></div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{setupMessage ? "Your workspace is protected" : "Your ideas, in your space."}</h1>
      {setupMessage ? <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
        <p>Inkspace stays locked until the owner finishes the secure sign-in setup.</p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{setupMessage}</p>
        <p>Owner: follow the deployment guide in the project, add the required environment variables, and redeploy.</p>
      </div> : <>
        <p className="mb-7 text-sm leading-6 text-slate-500">Sign in with your approved email address and password.</p>
        <LoginForm turnstileSiteKey={turnstileSiteKey} nonce={nonce} />
        <p className="mt-7 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">Access is by invitation. Your boards are private to your account.</p>
      </>}
    </section>
  </main>;
}
