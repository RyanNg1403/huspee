'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserProfile } from '@huspee/sdk';
import { getApiClient } from '@/lib/api';
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
  const refresh = useCallback(async () => {
    try {
      const u = await getApiClient().auth.me();
      setUser(u);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);
  useEffect(() => {
    // Ignore a response if the provider unmounts before it arrives.
    let active = true;
    getApiClient()
      .auth.me()
      .then((u) => {
        if (active) {
          setUser(u);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (active) {
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
    setUser(u);
    setStatus('authenticated');
    return u;
  }
  async function logout() {
    await getApiClient().auth.logout();
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
