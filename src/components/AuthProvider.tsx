import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '../hooks/useAuth'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { fetchMyProfile } from '../services/auth'
import type { Profile } from '../types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured)
  // The profile is stored together with the user id it belongs to, so a stale
  // profile is never shown after a logout or account switch.
  const [loaded, setLoaded] = useState<{ userId: string; profile: Profile | null } | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    // Keep this callback synchronous: querying Supabase inside it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let active = true
    fetchMyProfile(userId)
      .catch(() => null)
      .then((profile) => {
        if (active) setLoaded({ userId, profile })
      })
    return () => {
      active = false
    }
  }, [userId])

  const profile = userId && loaded?.userId === userId ? loaded.profile : null
  const profileLoading = Boolean(userId) && loaded?.userId !== userId

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin: profile?.role === 'admin',
      loading: sessionLoading || profileLoading,
    }),
    [session, profile, sessionLoading, profileLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
