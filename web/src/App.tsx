import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { api, clearToken, readToken, storeToken } from "./api";
import { Welcome, Setup } from "./views/Onboarding";
import { Dashboard } from "./views/Dashboard";
import { Skeleton } from "./ui";

type Phase = "boot" | "welcome" | "resolving" | "setup" | "dashboard";

export default function App() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [token, setToken] = useState<string | null>(readToken);
  const [phase, setPhase] = useState<Phase>("boot");
  const [authError, setAuthError] = useState<string | null>(null);
  const exchanging = useRef(false);

  // Exchange the Privy session for a Porta session exactly once.
  const exchange = useCallback(async () => {
    if (exchanging.current) return;
    exchanging.current = true;
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("no Privy session");
      const email = user?.email?.address;
      const result = await api.authPrivy(accessToken, email);
      storeToken(result.token);
      setToken(result.token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      exchanging.current = false;
    }
  }, [getAccessToken, user]);

  const resolvePhase = useCallback(async (t: string) => {
    try {
      const { config } = await api.config(t);
      setPhase(config ? "dashboard" : "setup");
    } catch {
      // Session expired or revoked; get a fresh one via Privy.
      clearToken();
      setToken(null);
    }
  }, []);

  useEffect(() => {
    // A stored Porta session wins; Privy is only the way to acquire one.
    if (token) {
      setPhase((p) => (p === "boot" || p === "welcome" ? "resolving" : p));
      void resolvePhase(token);
      return;
    }
    if (!ready) return;
    if (!authenticated) {
      setPhase("welcome");
      return;
    }
    setPhase("resolving");
    void exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, token]);

  const signOut = async () => {
    clearToken();
    setToken(null);
    await logout();
    setPhase("welcome");
  };

  if (phase === "welcome") {
    return <Welcome onLogin={login} error={authError} />;
  }
  if (phase === "boot" || phase === "resolving" || !token) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="mb-8 h-10 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }
  if (phase === "setup") {
    return <Setup token={token} onDone={() => setPhase("dashboard")} />;
  }
  return <Dashboard token={token} onSignOut={signOut} />;
}
