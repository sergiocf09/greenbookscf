import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RoundProvider } from "@/contexts/RoundContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import JoinRound from "./pages/JoinRound";
import JoinByCode from "./pages/JoinByCode";
import Leaderboards from "./pages/Leaderboards";
import LeaderboardDetail from "./pages/LeaderboardDetail";
import JoinLeaderboard from "./pages/JoinLeaderboard";
import MoneyRankings from "./pages/MoneyRankings";
import MoneyRankingDetail from "./pages/MoneyRankingDetail";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

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
  if (!user || user.is_anonymous || !profile) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

// Ruta pública: redirige a / solo si hay usuario real con profile
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  // Solo redirigir si el usuario está completamente autenticado (no anónimo, con profile)
  if (user && !user.is_anonymous && profile) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/join/:roundId" element={<JoinRound />} />
    <Route path="/join" element={<JoinByCode />} />
    <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
    <Route path="/leaderboards/:id" element={<ProtectedRoute><LeaderboardDetail /></ProtectedRoute>} />
    <Route path="/leaderboards/join/:code" element={<JoinLeaderboard />} />
    <Route path="/rankings" element={<ProtectedRoute><MoneyRankings /></ProtectedRoute>} />
    <Route path="/rankings/:id" element={<ProtectedRoute><MoneyRankingDetail /></ProtectedRoute>} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
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
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
