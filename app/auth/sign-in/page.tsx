"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../components/AuthContext";
import { XchangeLogo } from "../../../components/XchangeLogo";

function SignInForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const redirectTo = "/feed";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn({ email, password });
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen app-page font-[&quot;Times_New_Roman&quot;,serif]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <header className="absolute left-6 top-6">
          <XchangeLogo />
        </header>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-zinc-50">
            Sign in to Xchange
          </h1>
          <p className="mt-2 text-xs text-zinc-400">
            Access your communities, ideas, and profile.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/10 bg-[#050713] p-5 shadow-[0_0_40px_rgba(15,23,42,0.9)]"
        >
          <p className="mb-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
            <svg className="h-3 w-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c-1.105 0-2 .895-2 2v2a2 2 0 104 0v-2c0-1.105-.895-2-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 11V9a6 6 0 1112 0v2m-1 8H7a2 2 0 01-2-2v-6a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2z" />
            </svg>
            <span>Your email and password are kept private to your account.</span>
          </p>
          <div className="space-y-1 text-xs">
            <label className="block text-zinc-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-[#00C896]/70"
            />
          </div>
          <div className="space-y-1 text-xs">
            <label className="block text-zinc-300" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 pr-10 text-xs text-zinc-100 outline-none focus:border-[#00C896]/70"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#00C896]/50"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-amber-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full px-4 py-2 text-xs font-semibold text-[#020308] shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          style={{ backgroundColor: "#00C896", boxShadow: "0 10px 15px -3px rgba(0,200,150,0.4)" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-3 text-[11px] text-zinc-400">
            New to Xchange?{" "}
            <Link
              href="/auth/sign-up"
              className="font-semibold transition hover:opacity-90"
              style={{ color: "#00C896" }}
            >
              Create an account
            </Link>
            .
          </p>
        </form>

        <p className="mt-4 text-center text-[10px] text-zinc-500">
          Demo: your account exists only in this browser. If you signed up in another tab or cleared data, sign up again here.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center app-page">
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
