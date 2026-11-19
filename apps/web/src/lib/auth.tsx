import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearCsrfCache } from '@/lib/api';

export type ClinicUser = {
  id: string;
  name: string;
  email: string;
  role: 'clinic_manager' | 'clinic_doctor' | 'clinic_cashier' | 'clinic_receptionist';
  tenantId: string;
  clinicName: string;
};

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: 'platform_admin';
};

type AuthState<T> = {
  user: T | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: T | null) => void;
};

const ClinicAuthContext = createContext<AuthState<ClinicUser> | null>(null);
const PlatformAuthContext = createContext<AuthState<PlatformUser> | null>(null);

export function ClinicAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ClinicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<ClinicUser>('/clinic-auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/clinic-auth/logout', { method: 'POST', json: {} });
    clearCsrfCache();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout, setUser }),
    [user, loading, refresh, logout],
  );

  return <ClinicAuthContext.Provider value={value}>{children}</ClinicAuthContext.Provider>;
}

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<PlatformUser>('/platform-auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/platform-auth/logout', { method: 'POST', json: {} });
    clearCsrfCache();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout, setUser }),
    [user, loading, refresh, logout],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function useClinicAuth() {
  const ctx = useContext(ClinicAuthContext);
  if (!ctx) throw new Error('ClinicAuthProvider missing');
  return ctx;
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('PlatformAuthProvider missing');
  return ctx;
}
