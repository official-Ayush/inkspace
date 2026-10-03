"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

type Turnstile = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme: "light";
    size: "flexible";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

async function postAuth(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Please try again shortly.");
  return data as { message?: string };
}

export default function LoginForm({ turnstileSiteKey, nonce }: { turnstileSiteKey: string; nonce?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);

  const renderCaptcha = useCallback(() => {
    if (!turnstileSiteKey || !window.turnstile || !containerRef.current || widgetRef.current !== null) return;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: turnstileSiteKey, theme: "light", size: "flexible", callback: setCaptchaToken,
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => { setCaptchaToken(""); setError("The security check could not load. Refresh the page and try again."); },
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    renderCaptcha();
    return () => {
      if (widgetRef.current !== null) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [renderCaptcha]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await postAuth("/api/auth/login", { email, password, captchaToken });
      // A full navigation uses the new HttpOnly cookies and clears stale UI.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again shortly.");
    } finally {
      setBusy(false);
      setPassword("");
      setCaptchaToken("");
      if (widgetRef.current !== null) window.turnstile?.reset(widgetRef.current);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60";
  return <>
    {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} strategy="afterInteractive" onReady={renderCaptcha} onError={() => setError("The security check could not load. Refresh the page and try again.")} />}
    <form onSubmit={submit} className="space-y-5">
        <div><label className="text-sm font-medium" htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className={inputClass} /></div>
        <div><label className="text-sm font-medium" htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className={inputClass} /></div>
        {turnstileSiteKey && <div ref={containerRef} aria-label="Security check" className="min-h-16" />}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">{error}</p>}
      <button type="submit" disabled={busy || (!!turnstileSiteKey && !captchaToken)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
        {busy ? "Please wait…" : "Sign in"}
      </button>
      <p className="text-xs leading-5 text-slate-500">Forgot your password? Contact the workspace owner to reset it.</p>
    </form>
  </>;
}
