import React from 'react';
import { Button } from '@/components/ui/button';
import { ManualCourseData } from '@/hooks/useManualCourse';
import { Loader2 } from 'lucide-react';

interface Props {
  data: ManualCourseData;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}

const TEE_LABELS: Record<string, string> = {
  blue: 'Azules',
  white: 'Blancas',
  yellow: 'Amarillas',
  red: 'Rojas',
};

export const CourseReviewStep: React.FC<Props> = ({ data, saving, onBack, onSave }) => {
  const totalPar = data.holes.reduce((s, h) => s + (h.par || 0), 0);
  const frontPar = data.holes.slice(0, 9).reduce((s, h) => s + (h.par || 0), 0);
  const backPar = data.holes.slice(9).reduce((s, h) => s + (h.par || 0), 0);

  return (
    <div className="space-y-4">
      {/* Course info */}
      <div className="rounded-lg bg-muted/50 p-3 space-y-1">
        <p className="font-semibold">{data.name}</p>
        <p className="text-xs text-muted-foreground">{data.city}, {data.country}</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Tee: {TEE_LABELS[data.teeName] || data.teeName}</span>
          <span>Slope: {data.slope}</span>
          <span>Rating: {data.rating}</span>
          <span>Par: {totalPar}</span>
        </div>
      </div>

      {/* Holes table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1 text-left">Hoyo</th>
              <th className="py-1 text-center">Par</th>
              <th className="py-1 text-center">HCP</th>
              {data.captureYards && <th className="py-1 text-center">Yds</th>}
            </tr>
          </thead>
          <tbody>
            {data.holes.map((h, i) => (
              <tr key={i} className={i === 8 ? 'border-b-2 border-primary/30' : 'border-b border-border/50'}>
                <td className="py-1 font-medium">{i + 1}</td>
                <td className="py-1 text-center">{h.par}</td>
                <td className="py-1 text-center">{h.strokeIndex}</td>
                {data.captureYards && <td className="py-1 text-center">{h.yards || '—'}</td>}
              </tr>
            ))}
            {/* Totals */}
            <tr className="font-bold border-t-2 border-border">
              <td className="py-1">OUT</td>
              <td className="py-1 text-center">{frontPar}</td>
              <td className="py-1 text-center">—</td>
              {data.captureYards && (
                <td className="py-1 text-center">
                  {data.holes.slice(0, 9).reduce((s, h) => s + (h.yards || 0), 0) || '—'}
                </td>
              )}
            </tr>
            <tr className="font-bold">
              <td className="py-1">IN</td>
              <td className="py-1 text-center">{backPar}</td>
              <td className="py-1 text-center">—</td>
              {data.captureYards && (
                <td className="py-1 text-center">
                  {data.holes.slice(9).reduce((s, h) => s + (h.yards || 0), 0) || '—'}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={saving}>
          ← Editar hoyos
        </Button>
        <Button onClick={onSave} className="flex-1" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar Campo Manual'}
        </Button>
      </div>
    </div>
  );
};
