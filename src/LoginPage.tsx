import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type AuthMode = "login" | "signup";

export default function LoginPage(props: { onBack?: () => void; onAuthed?: () => void }) {
  const onBack = props.onBack ?? (() => (window.location.hash = "#/"));
  const onAuthed = props.onAuthed ?? (() => (window.location.hash = "#/"));

  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      // If the user just logged in, kick them back to the app.
      onAuthed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const heading = useMemo(() => {
    return mode === "login" ? "Welcome back" : "Create your account";
  }, [mode]);

  const subheading = useMemo(() => {
    return mode === "login"
      ? "Please enter your details to sign in."
      : "Start turning your diary into cinematic reels.";
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setMessage("Sign-up successful. Check your email for confirmation.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        setMessage("Logged in successfully.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    setMessage("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/#/" },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/#/",
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Password reset email sent. Check your inbox.");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center p-4 font-display text-text-main">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="fixed left-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 backdrop-blur border border-border-color text-text-auth-muted hover:text-text-main transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      </button>

      <div className="w-full max-w-[480px] rounded-xl shadow-soft overflow-hidden bg-card-white">
        <div className="flex border-b border-border-color">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={
              "flex-1 py-4 text-center text-sm font-bold transition-colors " +
              (mode === "login"
                ? "text-text-main border-b-2 border-primary bg-primary/5"
                : "text-text-auth-muted hover:text-text-main hover:bg-gray-50")
            }
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={
              "flex-1 py-4 text-center text-sm font-bold transition-colors " +
              (mode === "signup"
                ? "text-text-main border-b-2 border-primary bg-primary/5"
                : "text-text-auth-muted hover:text-text-main hover:bg-gray-50")
            }
          >
            Sign Up
          </button>
        </div>

        <div className="flex flex-col items-center pt-8 px-8 pb-2">
          <div className="flex items-center gap-3 text-text-main mb-4">
            <div className="size-10 bg-primary/20 rounded-lg flex items-center justify-center text-primary-hover">
              <span className="material-symbols-outlined text-[28px]">movie_filter</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Life Reels</h1>
          </div>
          <h2 className="text-text-main text-[28px] font-bold leading-tight text-center">{heading}</h2>
          <p className="text-text-auth-muted text-base font-normal mt-2 text-center">{subheading}</p>
        </div>

        <div className="px-8 pt-6 pb-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border-color bg-white hover:bg-gray-50 transition-colors h-12 px-4 text-text-main text-sm font-bold leading-normal tracking-[0.015em] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="flex items-center gap-4 px-8 py-4">
          <div className="h-px flex-1 bg-border-color" />
          <p className="text-text-auth-muted text-xs font-semibold uppercase tracking-wider">OR</p>
          <div className="h-px flex-1 bg-border-color" />
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-text-main text-sm font-semibold">Email address</span>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border-color bg-white px-4 py-3 text-text-main placeholder:text-text-auth-muted/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all text-base"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-auth-muted pointer-events-none">
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </div>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-text-main text-sm font-semibold">Password</span>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border-color bg-white px-4 py-3 text-text-main placeholder:text-text-auth-muted/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all text-base"
                placeholder="Enter your password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-auth-muted hover:text-text-main transition-colors cursor-pointer"
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            {mode === "login" && (
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-semibold text-text-auth-muted hover:text-primary transition-colors"
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </label>

          <button
            className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg bg-primary hover:bg-primary-hover transition-colors h-12 px-6 text-text-main text-base font-bold shadow-sm active:scale-[0.98] disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Working..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>

          {mode === "login" && (
            <div className="bg-primary/10 rounded-lg p-4 mt-2 flex flex-col items-center gap-3 border border-primary/20">
              <p className="text-text-main text-sm font-medium text-center">
                New here? Join Life Reels today.
              </p>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="w-full flex items-center justify-center rounded-lg border-2 border-primary text-text-main hover:bg-primary/20 transition-all h-10 px-4 text-sm font-bold uppercase tracking-wide"
              >
                Create an Account
              </button>
            </div>
          )}

          {message && (
            <p className="text-sm font-semibold text-[#1c7c3a] bg-[rgba(28,124,58,0.08)] border border-[rgba(28,124,58,0.15)] rounded-lg p-3">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm font-semibold text-[#b32424] bg-[rgba(179,36,36,0.08)] border border-[rgba(179,36,36,0.15)] rounded-lg p-3">
              {error}
            </p>
          )}
        </form>

        <div className="h-2 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
      </div>
    </div>
  );
}
