"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ClientUser = { id: string; email: string | null };

// undefined = still checking, null = signed out
const SessionContext = createContext<ClientUser | null | undefined>(undefined);

/** Tracks the signed-in user in the browser (for the header link and cart sync). */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    // Fires INITIAL_SESSION straight away, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      setUser((prev) => (prev?.id === next?.id && prev !== undefined ? prev : next));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  return useContext(SessionContext);
}
