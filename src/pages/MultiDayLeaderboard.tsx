import { useParams, useNavigate } from 'react-router-dom';
import { MultiDayLeaderboardDetail } from '@/components/leaderboards/MultiDayLeaderboardDetail';

const MultiDayLeaderboard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return null;
  return (
    <MultiDayLeaderboardDetail
      leaderboardId={id}
      onBack={() => navigate('/leaderboards')}
    />
  );
};

export default MultiDayLeaderboard;
