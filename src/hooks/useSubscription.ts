import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";
import { isPaywallActive } from "@/lib/paywallConfig";

export function useSubscription() {
  const { profile } = useAuth();

  const isPro = Boolean(
    profile?.subscription_tier === "pro" &&
    (
      !profile?.subscription_expires_at ||
      new Date(profile.subscription_expires_at) > new Date()
    )
  );

  const isFounder = Boolean(profile?.is_founder);

  const [organizerRoundsCount, setOrganizerRoundsCount] = useState<number>(0);
  const [participatedRoundsCount, setParticipatedRoundsCount] = useState<number>(0);
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (!isPaywallActive()) {
      setCountsLoaded(true);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [{ data: countA }, { data: countB }] = await Promise.all([
        supabase.rpc('get_organizer_rounds_closed_count'),
        supabase.rpc('get_participated_rounds_closed_count'),
      ]);
      if (cancelled) return;
      setOrganizerRoundsCount(typeof countA === 'number' ? countA : 0);
      setParticipatedRoundsCount(typeof countB === 'number' ? countB : 0);
      setCountsLoaded(true);
    };
    load();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const paywallOn = isPaywallActive();

  const canCreateRound = !paywallOn || isPro || organizerRoundsCount < 12;
  const canAccessHistory = !paywallOn || isPro || participatedRoundsCount < 4;
  const canShare = !paywallOn || isPro || organizerRoundsCount < 12;
  const canCreateLeaderboard = !paywallOn || isPro;
  const canViewStats = !paywallOn || isPro || isFounder;

  const startCheckout = useCallback(async (plan: "semestral" | "anual") => {
    const res = await supabase.functions.invoke("create-checkout-session", {
      body: { plan },
    });
    if (res.error) throw new Error(res.error.message ?? "Error iniciando pago");
    const { url } = res.data as { url: string };
    if (url) window.location.href = url;
  }, []);

  return {
    isPro,
    isFounder,
    canCreateRound,
    canAccessHistory,
    canShare,
    canCreateLeaderboard,
    canViewStats,
    organizerRoundsCount,
    participatedRoundsCount,
    countsLoaded,
    startCheckout,
  };
}
