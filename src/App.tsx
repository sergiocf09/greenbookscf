import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RoundProvider } from "@/contexts/RoundContext";
import Auth from "./pages/Auth";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { Loader2 } from "lucide-react";

// The main round screen is the heaviest part of the app. Loading it as its own
// chunk lets the sign-in screen paint without downloading it first; it is
// fetched right away when a saved session exists, and in idle time otherwise.
const loadIndex = () => import("./pages/Index");
const Index = lazy(loadIndex);

const hasStoredSession = () => {
  try {
    return Object.keys(localStorage).some(
      (k) => (k.startsWith("sb-") && k.endsWith("-auth-token")) || k.startsWith("guest_session_"),
    );
  } catch {
    return false;
  }
};

if (typeof window !== "undefined") {
  if (hasStoredSession()) {
    void loadIndex();
  } else {
    const prefetch = () => { void loadIndex(); };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    window.addEventListener("load", () => {
      if (idle) idle(prefetch, { timeout: 5000 });
      else setTimeout(prefetch, 2000);
    }, { once: true });
  }
}

const ResetPassword   = lazy(() => import("./pages/ResetPassword"));
const JoinRound       = lazy(() => import("./pages/JoinRound"));
const JoinByCode      = lazy(() => import("./pages/JoinByCode"));
const JoinLeaderboard = lazy(() => import("./pages/JoinLeaderboard"));
const NotFound        = lazy(() => import("./pages/NotFound"));
const TermsOfService  = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy   = lazy(() => import("./pages/PrivacyPolicy"));

// Lazy-loaded heavy routes (separate chunks)
const Stats              = lazy(() => import("./pages/Stats"));
const TeamsCupDetail     = lazy(() => import("./pages/TeamsCupDetail"));
const MoneyRankingDetail = lazy(() => import("./pages/MoneyRankingDetail"));
const LeaderboardDetail  = lazy(() => import("./pages/LeaderboardDetail"));
const MultiDayLeaderboard = lazy(() => import("./pages/MultiDayLeaderboard"));
const LeagueLeaderboard   = lazy(() => import("./pages/LeagueLeaderboard"));
const MoneyRankings      = lazy(() => import("./pages/MoneyRankings"));
const Leaderboards       = lazy(() => import("./pages/Leaderboards"));
const ScorecardImporter  = lazy(() => import("./pages/ScorecardImporter"));



const queryClient = new QueryClient();

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Ruta protegida: requiere usuario real autenticado CON profile cargado
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  // Registered user with profile
  if (user && !user.is_anonymous && profile) return <>{children}</>;
  // Anonymous user with a valid guest session in localStorage
  if (user?.is_anonymous) {
    const hasGuestSession = Object.keys(localStorage).some(k =>
      k.startsWith('guest_session_')
    );
    if (hasGuestSession) return <>{children}</>;
  }
  return <Navigate to="/auth" replace />;
};

// Ruta pública: redirige a / solo si hay usuario real con profile
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user && !user.is_anonymous && profile) {
    // Check for pending returnTo from invitation flow
    const pending = sessionStorage.getItem('pendingReturnTo');
    if (pending) {
      sessionStorage.removeItem('pendingReturnTo');
      return <Navigate to={pending} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => (
  <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join/:roundId" element={<JoinRound />} />
      <Route path="/join" element={<JoinByCode />} />
      <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
      <Route path="/leaderboards/cup/:id" element={<ProtectedRoute><TeamsCupDetail /></ProtectedRoute>} />
      <Route path="/leaderboards/multi/:id" element={<ProtectedRoute><MultiDayLeaderboard /></ProtectedRoute>} />
      <Route path="/leaderboards/league/:id" element={<ProtectedRoute><LeagueLeaderboard /></ProtectedRoute>} />
      <Route path="/leaderboards/:id" element={<ProtectedRoute><LeaderboardDetail /></ProtectedRoute>} />


      <Route path="/leaderboards/join/:code" element={<JoinLeaderboard />} />
      <Route path="/rankings" element={<ProtectedRoute><MoneyRankings /></ProtectedRoute>} />
      <Route path="/rankings/:id" element={<ProtectedRoute><MoneyRankingDetail /></ProtectedRoute>} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
      <Route path="/import-scorecard" element={<ProtectedRoute><ScorecardImporter /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="gbcf-theme">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoundProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
           <BrowserRouter>
             <AppRoutes />
             <PWAInstallBanner />
           </BrowserRouter>
        </TooltipProvider>
        </RoundProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
