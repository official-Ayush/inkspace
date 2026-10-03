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
  const [token, setToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const renderCaptcha = useCallback(() => {
    if (!turnstileSiteKey || !window.turnstile || !containerRef.current || widgetRef.current !== null) return;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: turnstileSiteKey, theme: "light", size: "flexible", callback: setCaptchaToken,
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => { setCaptchaToken(""); setError("The security check could not load. Refresh the page and try again."); },
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (step !== "email") return;
    renderCaptcha();
    return () => {
      if (widgetRef.current !== null) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [renderCaptcha, step]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => { if (step === "code") inputRef.current?.focus(); }, [step]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (step === "email") {
        const data = await postAuth("/api/auth/login", { email, captchaToken });
        setEmail(email.trim().toLowerCase());
        setMessage(data.message ?? "Check your email for a sign-in code.");
        setStep("code"); setCooldown(60);
      } else {
        await postAuth("/api/auth/verify", { email, token });
        // A full navigation uses the new HttpOnly cookies and clears stale UI.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again shortly.");
    } finally {
      setBusy(false);
      if (step === "email") {
        setCaptchaToken("");
        if (widgetRef.current !== null) window.turnstile?.reset(widgetRef.current);
      }
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-60";
  return <>
    {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} strategy="afterInteractive" onReady={renderCaptcha} onError={() => setError("The security check could not load. Refresh the page and try again.")} />}
    <form onSubmit={submit} className="space-y-5">
      {step === "email" ? <>
        <div><label className="text-sm font-medium" htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className={inputClass} /></div>
        {turnstileSiteKey && <div ref={containerRef} aria-label="Security check" className="min-h-16" />}
      </> : <>
        <p className="break-words text-sm text-slate-600">Code sent to <strong>{email}</strong></p>
        <div><label className="text-sm font-medium" htmlFor="login-code">Email code</label><input ref={inputRef} id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} onChange={event => setToken(event.target.value.replace(/\D/g, ""))} disabled={busy} className={`${inputClass} tracking-[.35em]`} /></div>
      </>}
      {message && <p role="status" className="text-sm leading-5 text-slate-600">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">{error}</p>}
      <button type="submit" disabled={busy || (step === "email" && (!!turnstileSiteKey && !captchaToken || cooldown > 0))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
        {busy ? "Please wait…" : step === "code" ? "Open my workspace" : cooldown > 0 ? `Wait ${cooldown}s to resend` : "Send sign-in code"}
      </button>
      {step === "code" && <button type="button" disabled={busy} onClick={() => { setStep("email"); setToken(""); setCaptchaToken(""); setError(""); setMessage(""); }} className="w-full text-sm text-violet-700 underline underline-offset-4">Use another email or request a new code</button>}
    </form>
  </>;
}
