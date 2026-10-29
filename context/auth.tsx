import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { type Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { usernameToEmail } from '@/lib/username';

type UserRole = 'admin' | 'student';

type Profile = {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
};

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  username: string | null;
  isAdmin: boolean;
  /** True while an entitlement is live, or for Idit. Gates every paid track. */
  hasAccess: boolean;
  accessExpiresAt: string | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Call after Idit grants access so the student sees it without re-login. */
  refreshAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const username = profile?.username
    ?? (session?.user?.user_metadata?.username as string | undefined)
    ?? null;
  const isAdmin = profile?.role === 'admin';
  // Idit always has access -- she needs to hear what she published.
  const hasAccess = isAdmin || accessExpiresAt !== null;

  const loadAccess = useCallback(async (userId: string) => {
    // RLS limits this to the caller's own rows, so no user_id filter is needed
    // for correctness -- it is here to keep the query index-friendly.
    try {
      const { data } = await supabase
        .from('entitlements')
        .select('expires_at')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .lte('starts_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1);
      setAccessExpiresAt(data?.[0]?.expires_at ?? null);
    } catch {
      // Treat an unreachable backend as "no access" rather than crashing the
      // gate; the banner simply shows and a refresh retries.
      setAccessExpiresAt(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setAccessExpiresAt(null);
      return;
    }

    let cancelled = false;
    setIsProfileLoading(true);

    // Every path must clear isProfileLoading. The root layout holds the splash
    // screen until it is false, so a thrown request here leaves the app on a
    // blank splash forever with nothing in the logs.
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, role, created_at')
          .eq('id', userId)
          .single();

        if (cancelled) return;
        // PGRST116 = no row. The handle_new_user() trigger should have created
        // one, so this means something is wrong rather than "needs onboarding".
        if (error && error.code !== 'PGRST116') {
          console.warn('profile load failed', error.message);
        }
        setProfile((data as Profile) ?? null);
        await loadAccess(userId);
      } catch (e) {
        console.warn('profile/access load failed', e);
      } finally {
        if (!cancelled) setIsProfileLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, loadAccess]);

  const refreshAccess = useCallback(async () => {
    const userId = session?.user?.id;
    if (userId) await loadAccess(userId);
  }, [session?.user?.id, loadAccess]);

  const signIn = async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      if (error.message === 'Invalid login credentials') {
        throw new Error('שם משתמש או סיסמה שגויים');
      }
      throw error;
    }
  };

  const signUp = async (username: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
      options: { data: { username } },
    });
    if (error) {
      if (error.message.includes('already registered')) {
        throw new Error('שם המשתמש הזה כבר תפוס');
      }
      throw error;
    }
    // Email confirmation is off, so a session must come back immediately.
    // If it does not, confirmations got switched back on in the dashboard --
    // see README, it locks every student out of signing up.
    if (!data.session) throw new Error('ההרשמה נכשלה, נסי שוב');
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
    setAccessExpiresAt(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        username,
        isAdmin,
        hasAccess,
        accessExpiresAt,
        isLoading,
        isProfileLoading,
        signIn,
        signUp,
        signOut,
        refreshAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
