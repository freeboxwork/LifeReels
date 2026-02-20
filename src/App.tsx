import { useEffect, useState } from "react";
import DiaryScenarioPrototype from "./DiaryScenarioPrototype";
import LandingPage from "./LandingPage";
import DiaryGraphPaperCard from "./DiaryGraphPaperCard";
import type { ReelScriptV2 } from "./lib/reelsScriptTypes";
import LoginPage from "./LoginPage";
import { useHashRoute } from "./useHashRoute";
import GeneratePage from "./GeneratePage";
import LoadingPage from "./LoadingPage";
import ResultPage from "./ResultPage";
import { supabase } from "./supabaseClient";

function parseHashAuthTokens(hash: string): { accessToken: string; refreshToken: string } | null {
  const raw = String(hash || "").trim();
  if (!raw) return null;

  // Handles "#access_token=..." and broken "#/#access_token=..." forms.
  const cleaned = raw
    .replace(/^#\/?/, "")
    .replace(/^#/, "");

  const params = new URLSearchParams(cleaned);
  const accessToken = String(params.get("access_token") || "").trim();
  const refreshToken = String(params.get("refresh_token") || "").trim();

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function shouldLogAuthDebug() {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export default function App() {
  const [graphTitle, setGraphTitle] = useState<string>("");
  const [graphNarrations, setGraphNarrations] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userLabel, setUserLabel] = useState<string>("");
  const { route, query, navigate } = useHashRoute();

  useEffect(() => {
    let cancelled = false;

    async function bootstrapHash() {
      const hash = String(window.location.hash || "");
      const tokens = parseHashAuthTokens(hash);

      // If OAuth tokens exist in hash, persist session first, then cleanup URL.
      if (tokens) {
        try {
          await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Some environments can be 1-2 seconds behind right after redirect.
          // Retry once when GoTrue warns token "was issued in the future".
          if (/issued in the future/i.test(msg)) {
            await new Promise((r) => setTimeout(r, 2000));
            await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            });
          }
        }

        if (cancelled) return;
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#/`,
        );
        return;
      }

      // Cleanup only non-session auth fragments such as "#/#..." leftovers.
      const hasBrokenAuthHash =
        hash.startsWith("#/#") ||
        hash.includes("provider_token=") ||
        hash.includes("token_type=");
      if (hasBrokenAuthHash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#/`,
        );
        return;
      }

      if (!window.location.hash) {
        window.location.hash = "#/";
      }
    }

    void bootstrapHash();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (shouldLogAuthDebug()) {
        console.log("[auth] getSession()", {
          hasSession: Boolean(data.session),
          userId: data.session?.user?.id,
          email: data.session?.user?.email,
        });
      }
      setIsAuthed(Boolean(data.session));
      const nextUser = data.session?.user;
      setUserLabel(
        String(
          nextUser?.user_metadata?.full_name ||
          nextUser?.user_metadata?.name ||
          nextUser?.email ||
          "",
        ),
      );
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (shouldLogAuthDebug()) {
        console.log("[auth] onAuthStateChange", {
          event: _event,
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id,
          email: nextSession?.user?.email,
        });
      }
      setIsAuthed(Boolean(nextSession));
      const nextUser = nextSession?.user;
      setUserLabel(
        String(
          nextUser?.user_metadata?.full_name ||
          nextUser?.user_metadata?.name ||
          nextUser?.email ||
          "",
        ),
      );
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // routeKey forces React to remount (and re-animate) page components on every route change.
  // LoadingPage/ResultPage include the job id so result/loading re-mounts if a new job starts.
  const loadingId = route === "loading" ? String(query.get("id") ?? "") : "";
  const resultId  = route === "result"  ? String(query.get("id") ?? "") : "";
  const routeKey  = [route, loadingId, resultId].join(":");

  if (route === "login") {
    return (
      <LoginPage
        key={routeKey}
        onBack={() => navigate("home")}
        onAuthed={() => navigate("home")}
      />
    );
  }

  if (route === "generate") {
    if (!authReady) {
      return (
        <div key={routeKey} className="min-h-screen bg-background-light flex items-center justify-center p-8 font-display text-text-main page-enter">
          <div className="max-w-md w-full rounded-2xl bg-white border border-border-light p-6 shadow-sm">
            <h1 className="text-xl font-black">Checking session...</h1>
            <p className="text-text-muted mt-2">Please wait a moment.</p>
          </div>
        </div>
      );
    }

    if (!isAuthed) {
      return (
        <LoginPage
          key={routeKey}
          onBack={() => navigate("home")}
          onAuthed={() => navigate("generate")}
        />
      );
    }

    return (
      <GeneratePage
        key={routeKey}
        onStarted={(jobId) => {
          window.location.hash = `#/loading?id=${encodeURIComponent(jobId)}`;
        }}
      />
    );
  }

  if (route === "loading") {
    const id = loadingId.trim();
    if (!id) {
      return (
        <div key={routeKey} className="min-h-screen bg-background-light flex items-center justify-center p-8 font-display text-text-main page-enter">
          <div className="max-w-md w-full rounded-2xl bg-white border border-border-light p-6 shadow-sm">
            <h1 className="text-xl font-black">Missing job id</h1>
            <p className="text-text-muted mt-2">Open this page via Generate, or pass `#/loading?id=...`</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-primary px-5 py-2 font-bold text-[#181411]"
              onClick={() => navigate("generate")}
            >
              Go to Generate
            </button>
          </div>
        </div>
      );
    }
    return (
      <LoadingPage
        key={routeKey}
        jobId={id}
        onDone={() => {
          window.location.hash = `#/result?id=${encodeURIComponent(id)}`;
        }}
      />
    );
  }

  if (route === "result") {
    const id = resultId.trim();
    if (!id) {
      return (
        <div key={routeKey} className="min-h-screen bg-background-light flex items-center justify-center p-8 font-display text-text-main page-enter">
          <div className="max-w-md w-full rounded-2xl bg-white border border-border-light p-6 shadow-sm">
            <h1 className="text-xl font-black">Missing job id</h1>
            <p className="text-text-muted mt-2">Open this page via Loading, or pass `#/result?id=...`</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-primary px-5 py-2 font-bold text-[#181411]"
              onClick={() => navigate("generate")}
            >
              Go to Generate
            </button>
          </div>
        </div>
      );
    }
    return <ResultPage key={routeKey} jobId={id} onCreateAnother={() => navigate("generate")} />;
  }

  if (route === "prototype") {
    return (
      <main key={routeKey} className="auth-page" id="diary">
        <DiaryGraphPaperCard title={graphTitle} narrations={graphNarrations} />
        <DiaryScenarioPrototype
          onScenarioGenerated={(scenario: ReelScriptV2) => {
            setGraphTitle(String(scenario.title || "").trim());
            setGraphNarrations(
              (scenario.shots || [])
                .map((s) => String(s.subtitle || "").trim())
                .filter(Boolean),
            );
          }}
          onSummaryGenerated={(summary) => {
            setGraphTitle(summary.title);
            setGraphNarrations(summary.lines);
          }}
        />
      </main>
    );
  }

  return (
    <LandingPage
      key={routeKey}
      onStartWriting={() => navigate("generate")}
      onLogin={() => navigate("login")}
      onLogout={async () => {
        await supabase.auth.signOut();
        navigate("home");
      }}
      isAuthed={isAuthed}
      authReady={authReady}
      userLabel={userLabel}
    />
  );
}
