import { trs } from '@/i18n/tr';
import React from 'react';
import { Users, Users2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { BetCategory } from '@/types/golf';

interface BetCategoryTabsProps {
  activeCategory: BetCategory;
  onCategoryChange: (category: BetCategory) => void;
}

const categories: { id: BetCategory; label: string; icon: React.ReactNode; description: string }[] = [
  { 
    id: 'individual', 
    label: 'betSetup.individual', 
    icon: <Users className="h-5 w-5" />,
    description: trs("betSetup.individualDesc")
  },
  { 
    id: 'parejas', 
    label: 'betSetup.pairs', 
    icon: <Users2 className="h-5 w-5" />,
    description: trs("betSetup.pairsDesc")
  },
  { 
    id: 'grupal', 
    label: 'betSetup.group', 
    icon: <Globe className="h-5 w-5" />,
    description: trs("betSetup.groupDesc")
  },
];

export const BetCategoryTabs: React.FC<BetCategoryTabsProps> = ({
  activeCategory,
  onCategoryChange,
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 w-full bg-muted/70 p-2 rounded-xl">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onCategoryChange(cat.id)}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border transition-all',
            activeCategory === cat.id
              ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary shadow-md'
              : 'bg-card text-muted-foreground border-transparent hover:bg-muted/50'
          )}
        >
          {cat.icon}
          <span className="text-xs font-medium">{t(cat.label)}</span>
          <span className={cn(
            'text-[9px]',
            activeCategory === cat.id ? 'text-primary-foreground/80' : 'text-muted-foreground'
          )}>
            {t(cat.description)}
          </span>
        </button>
      ))}
    </div>
  );
};
