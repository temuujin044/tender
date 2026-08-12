"use client";

import { useEffect, useState } from "react";
import { AUTH_STATE_EVENT, getStoredAuthState } from "@/lib/auth";

export function useAuthState() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const syncAuthState = () => {
      setIsAuthenticated(getStoredAuthState());
      setIsReady(true);
    };

    syncAuthState();
    window.addEventListener("storage", syncAuthState);
    window.addEventListener(AUTH_STATE_EVENT, syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener(AUTH_STATE_EVENT, syncAuthState);
    };
  }, []);

  return { isAuthenticated, isReady };
}
