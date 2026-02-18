import { useEffect, useMemo, useState } from "react";

export type HashRoute = "home" | "login" | "generate" | "loading" | "result" | "prototype";

export type HashLocation = {
  route: HashRoute;
  query: URLSearchParams;
};

function parseHash(hash: string): HashLocation {
  const raw = String(hash || "").trim();
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw;
  const [pathRaw, qsRaw] = withoutHash.split("?", 2);
  const path = (pathRaw || "/").trim();
  const query = new URLSearchParams(qsRaw || "");

  if (path === "/login" || path.startsWith("/login/")) return { route: "login", query };
  if (path === "/generate" || path.startsWith("/generate/")) return { route: "generate", query };
  if (path === "/loading" || path.startsWith("/loading/")) return { route: "loading", query };
  if (path === "/result" || path.startsWith("/result/")) return { route: "result", query };
  if (path === "/prototype" || path.startsWith("/prototype/")) return { route: "prototype", query };
  return { route: "home", query };
}

export function useHashRoute() {
  const [loc, setLoc] = useState<HashLocation>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setLoc(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useMemo(() => {
    return (next: HashRoute) => {
      const nextHash =
        next === "login"
          ? "#/login"
          : next === "generate"
            ? "#/generate"
            : next === "loading"
              ? "#/loading"
              : next === "result"
                ? "#/result"
              : next === "prototype"
                ? "#/prototype"
                : "#/";
      if (window.location.hash === nextHash) return;
      window.location.hash = nextHash;
    };
  }, []);

  return { route: loc.route, query: loc.query, navigate };
}
