import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent as RKE } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type AuthMode = "login" | "signup";

function getEmailError(email: string): string {
  if (!email) return "";
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return valid ? "" : "올바른 이메일 형식을 입력해 주세요.";
}

function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length === 0) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) || /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return score as 0 | 1 | 2 | 3;
}

const strengthLabel: Record<1 | 2 | 3, string> = {
  1: "Weak",
  2: "Good",
  3: "Strong",
};

const strengthColor: Record<1 | 2 | 3, string> = {
  1: "bg-red-400",
  2: "bg-yellow-400",
  3: "bg-green-500",
};

export default function LoginPage(props: { onBack?: () => void; onAuthed?: () => void }) {
  const onBack = props.onBack ?? (() => (window.location.hash = "#/"));
  const onAuthed = props.onAuthed ?? (() => (window.location.hash = "#/"));

  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const emailError = emailTouched ? getEmailError(email) : "";
  const pwStrength = getPasswordStrength(password);

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

  async function handleSubmit(event: FormEvent) {
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
    setGoogleLoading(true);
    setError("");
    setMessage("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/#/" },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
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

  function handleModeChange(next: AuthMode) {
    setMode(next);
    setError("");
    setMessage("");
    setEmailTouched(false);
  }

  function handleTabKeyDown(e: RKE<HTMLButtonElement>, current: AuthMode) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = current === "login" ? "signup" : "login";
      handleModeChange(next);
      // move focus to sibling tab button
      const sibling = (e.currentTarget as HTMLElement)
        .closest('[role="tablist"]')
        ?.querySelector<HTMLElement>(`[data-tab="${next}"]`);
      sibling?.focus();
    }
  }

  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center p-4 font-display text-text-main page-enter">
      {/* Decorative background blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] opacity-30" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-orange-100/40 rounded-full blur-[100px] opacity-30" />
      </div>

      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="fixed left-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 backdrop-blur border border-border-color text-text-auth-muted hover:text-text-main transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      </button>

      <div className="relative z-10 w-full max-w-[480px] rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] overflow-hidden bg-card-white">
        {/* Tabs — keyboard: arrow keys to switch */}
        <div
          className="flex border-b border-border-color"
          role="tablist"
          aria-label="Authentication mode"
        >
          {(["login", "signup"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              data-tab={tab}
              aria-selected={mode === tab}
              aria-controls="auth-panel"
              onClick={() => handleModeChange(tab)}
              onKeyDown={(e) => handleTabKeyDown(e, tab)}
              tabIndex={mode === tab ? 0 : -1}
              className={
                "flex-1 py-4 text-center text-sm font-bold transition-all duration-150 " +
                (mode === tab
                  ? "text-text-main border-b-2 border-primary bg-primary/5"
                  : "text-text-auth-muted hover:text-text-main hover:bg-gray-50")
              }
            >
              {tab === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Logo & headings */}
        <div className="flex flex-col items-center pt-8 px-8 pb-2">
          <div className="flex items-center gap-3 text-text-main mb-4">
            <div className="size-10 bg-primary/20 rounded-xl flex items-center justify-center text-[#c88c10]">
              <span className="material-symbols-outlined text-[28px]">movie_filter</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Life Reels</h1>
          </div>
          <h2 className="text-text-main text-[28px] font-bold leading-tight text-center">{heading}</h2>
          <p className="text-text-auth-muted text-base font-normal mt-2 text-center">{subheading}</p>
        </div>

        {/* Google OAuth */}
        <div className="px-8 pt-6 pb-2">
          <button
            type="button"
            disabled={loading || googleLoading}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border-color bg-white hover:bg-gray-50 transition-colors h-12 px-4 text-text-main text-sm font-bold leading-normal tracking-[0.015em] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
          >
            {googleLoading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            <span>{googleLoading ? "Connecting..." : "Continue with Google"}</span>
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 px-8 py-4">
          <div className="h-px flex-1 bg-border-color" />
          <p className="text-text-auth-muted text-xs font-semibold uppercase tracking-wider">OR</p>
          <div className="h-px flex-1 bg-border-color" />
        </div>

        {/* Form */}
        <form
          id="auth-panel"
          role="tabpanel"
          aria-label={mode === "login" ? "Log in form" : "Sign up form"}
          onSubmit={handleSubmit}
          className="px-8 pb-8 flex flex-col gap-4"
        >
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-text-main text-sm font-semibold">
              Email address
            </label>
            <div className="relative">
              <input
                id="login-email"
                className={
                  "w-full rounded-xl border bg-white px-4 py-3 pr-10 text-text-main placeholder:text-text-auth-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-base " +
                  (emailError
                    ? "border-red-400 focus:border-red-400"
                    : emailTouched && !emailError && email
                      ? "border-green-400 focus:border-green-400"
                      : "border-border-color focus:border-primary")
                }
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                required
                aria-describedby={emailError ? "email-error" : undefined}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {emailError ? (
                  <span className="material-symbols-outlined text-[18px] text-red-400">error</span>
                ) : emailTouched && !emailError && email ? (
                  <span className="material-symbols-outlined text-[18px] text-green-500">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px] text-text-auth-muted">mail</span>
                )}
              </div>
            </div>
            {emailError && (
              <p id="email-error" className="text-xs text-red-500 font-medium mt-0.5">{emailError}</p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-text-main text-sm font-semibold">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                className="w-full rounded-xl border border-border-color bg-white px-4 py-3 pr-10 text-text-main placeholder:text-text-auth-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-base"
                placeholder="Enter your password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-auth-muted hover:text-text-main transition-colors cursor-pointer"
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            {/* Password strength bar — signup only */}
            {mode === "signup" && password.length > 0 && (
              <div className="mt-1.5">
                <div className="flex gap-1 h-1">
                  {([1, 2, 3] as const).map((n) => (
                    <div
                      key={n}
                      className={
                        "flex-1 rounded-full transition-all duration-300 " +
                        (pwStrength >= n ? strengthColor[pwStrength] : "bg-gray-200")
                      }
                    />
                  ))}
                </div>
                {pwStrength > 0 && (
                  <p className="text-[11px] text-text-muted mt-1">
                    Password strength:{" "}
                    <span
                      className={
                        pwStrength === 1
                          ? "text-red-500"
                          : pwStrength === 2
                            ? "text-yellow-600"
                            : "text-green-600"
                      }
                    >
                      {strengthLabel[pwStrength]}
                    </span>
                  </p>
                )}
              </div>
            )}

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
          </div>

          {/* Submit */}
          <button
            className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-hover transition-colors h-12 px-6 text-text-main text-base font-bold shadow-sm active:scale-[0.98] disabled:opacity-60"
            type="submit"
            disabled={loading || googleLoading}
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-main border-t-transparent" />
                <span>{mode === "login" ? "Signing in..." : "Creating account..."}</span>
              </>
            ) : (
              mode === "login" ? "Log In" : "Sign Up"
            )}
          </button>

          {/* Sign up CTA — login mode only */}
          {mode === "login" && (
            <div className="bg-primary/10 rounded-xl p-4 mt-1 flex flex-col items-center gap-3 border border-primary/20">
              <p className="text-text-main text-sm font-medium text-center">
                New here? Join Life Reels today.
              </p>
              <button
                type="button"
                onClick={() => handleModeChange("signup")}
                className="w-full flex items-center justify-center rounded-xl border-2 border-primary text-text-main hover:bg-primary/20 transition-all h-10 px-4 text-sm font-bold uppercase tracking-wide"
              >
                Create an Account
              </button>
            </div>
          )}

          {/* Status messages — aria-live for screen readers */}
          <div aria-live="polite" aria-atomic="true">
            {message && (
              <div className="flex items-start gap-3 text-sm font-semibold text-status-success bg-[rgba(28,124,58,0.08)] border border-[rgba(28,124,58,0.20)] rounded-xl p-3" role="status">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden="true">check_circle</span>
                <span>{message}</span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 text-sm font-semibold text-status-error bg-[rgba(179,36,36,0.08)] border border-[rgba(179,36,36,0.20)] rounded-xl p-3" role="alert">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden="true">error</span>
                <span>{error}</span>
              </div>
            )}
          </div>
        </form>

        <div className="h-1.5 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
      </div>
    </div>
  );
}
