import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, RefreshCw, User, LogOut,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GreenBookLogo from '@/components/GreenBookLogo';
import { ProfileDialog } from '@/components/ProfileDialog';
import { TeamsCupDetailInline } from '@/components/leaderboards/TeamsCupDetailInline';

const TeamsCupDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [showProfileDialog, setShowProfileDialog] = useState(false);

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Competencia no encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/leaderboards')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <GreenBookLogo height={24} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.reload()}
            aria-label="Actualizar"
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                <User className="h-4 w-4 mr-2" /> Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" /> Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        <TeamsCupDetailInline
          leaderboardId={id}
          onBack={() => navigate('/leaderboards')}
        />
      </div>

      <ProfileDialog open={showProfileDialog} onOpenChange={setShowProfileDialog} />
    </div>
  );
};

export default TeamsCupDetail;
