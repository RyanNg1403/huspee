'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { UserProfile } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
type Session = {
  user: UserProfile | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<Session['status']>('loading');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const u = await getApiClient().auth.me();
      if (revision.current !== current) return;
      setUser(u);
      setStatus('authenticated');
    } catch {
      if (revision.current !== current) return;
      setUser(null);
      setStatus('anonymous');
    }
  }, []);
  useEffect(() => {
    // Ignore a response if the provider unmounts before it arrives.
    let active = true;
    const current = ++revision.current;
    getApiClient()
      .auth.me()
      .then((u) => {
        if (active && revision.current === current) {
          setUser(u);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (active && revision.current === current) {
          setUser(null);
          setStatus('anonymous');
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function login(email: string, password: string) {
    const u = await getApiClient().auth.login(email, password);
    // A session check sent before login must not overwrite the successful authentication.
    revision.current++;
    setUser(u);
    setStatus('authenticated');
    return u;
  }
  async function logout() {
    await getApiClient().auth.logout();
    revision.current++;
    setUser(null);
    setStatus('anonymous');
  }
  return <Context.Provider value={{ user, status, refresh, login, logout }}>{children}</Context.Provider>;
}
export function useSession() {
  const s = useContext(Context);
  if (!s) throw new Error('SessionProvider required');
  return s;
}
