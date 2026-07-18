import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LeagueLeaderboardDetail } from '@/components/leaderboards/LeagueLeaderboardDetail';

export default function LeagueLeaderboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <LeagueLeaderboardDetail
      leaderboardId={id!}
      onBack={() => navigate('/leaderboards')}
    />
  );
}
