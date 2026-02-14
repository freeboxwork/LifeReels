import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type AuthMode = "login" | "signup";

export default function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setDisplayName(
          typeof data.session?.user.user_metadata?.display_name === "string"
            ? data.session.user.user_metadata.display_name
            : "",
        );
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setDisplayName(
        typeof nextSession?.user.user_metadata?.display_name === "string"
          ? nextSession.user.user_metadata.display_name
          : "",
      );
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

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

  async function handleSignOut() {
    setLoading(true);
    setError("");
    setMessage("");

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    } else {
      setMessage("Logged out.");
    }

    setLoading(false);
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage("Profile updated.");
    }

    setLoading(false);
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage("Password changed.");
      setNewPassword("");
    }

    setLoading(false);
  }

  async function handleSendResetEmail() {
    if (!session?.user.email) return;

    setLoading(true);
    setError("");
    setMessage("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      session.user.email,
      { redirectTo: window.location.origin },
    );

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Password reset email sent.");
    }

    setLoading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const { error: invokeError } = await supabase.functions.invoke(
      "delete-user",
    );

    if (invokeError) {
      setError(invokeError.message);
      setLoading(false);
      return;
    }

    setSession(null);
    setDeleteConfirmText("");
    setMessage("Account deleted.");
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    setMessage("");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>LifeReels Auth</h1>

        {session ? (
          <>
            <div className="session-box">
              <h2>My Page</h2>
              <p>
                Email: <strong>{session.user.email}</strong>
              </p>
              <p>
                User ID: <code>{session.user.id}</code>
              </p>
              <p>Created: {new Date(session.user.created_at).toLocaleString()}</p>
              <button onClick={handleSignOut} disabled={loading}>
                {loading ? "Working..." : "Log out"}
              </button>
            </div>

            <form onSubmit={handleUpdateProfile}>
              <h3>My Info</h3>
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
              <button type="submit" disabled={loading}>
                Save profile
              </button>
            </form>

            <form onSubmit={handleUpdatePassword}>
              <h3>Reset Password</h3>
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>
                Change password
              </button>
              <button type="button" onClick={handleSendResetEmail} disabled={loading}>
                Send reset email
              </button>
            </form>

            <div className="danger-zone">
              <h3>Delete Account</h3>
              <p>Type DELETE and click the button. This action is irreversible.</p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
              />
              <button type="button" onClick={handleDeleteAccount} disabled={loading}>
                Delete my account
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mode-toggle">
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => setMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={mode === "signup" ? "active" : ""}
                onClick={() => setMode("signup")}
                type="button"
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />

              <button type="submit" disabled={loading}>
                {loading
                  ? "Working..."
                  : mode === "signup"
                    ? "Create account"
                    : "Log in"}
              </button>
            </form>
            <button
              type="button"
              className="oauth-button"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              Continue with Google
            </button>
          </>
        )}

        {message && <p className="message ok">{message}</p>}
        {error && <p className="message err">{error}</p>}
      </section>
    </main>
  );
}
