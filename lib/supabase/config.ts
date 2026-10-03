import "server-only";
import { parseAuthConfiguration } from "@/lib/auth/policy";

export function getAuthConfiguration() { return parseAuthConfiguration(process.env); }

export function authCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}
