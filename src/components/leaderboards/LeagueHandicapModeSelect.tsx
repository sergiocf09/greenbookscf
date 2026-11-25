import { trs } from '@/i18n/tr';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type LeagueHandicapMode = 'fixed' | 'per_round';

export function LeagueHandicapModeSelect({ value, onChange }: {
  value: LeagueHandicapMode;
  onChange: (value: LeagueHandicapMode) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="league-handicap-mode">{trs('Hándicap de la liga')}</Label>
      <Select value={value} onValueChange={(next) => onChange(next === 'per_round' ? 'per_round' : 'fixed')}>
        <SelectTrigger id="league-handicap-mode"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed">{trs('Fijo durante toda la liga')}</SelectItem>
          <SelectItem value="per_round">{trs('Variable: hándicap de cada ronda')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}