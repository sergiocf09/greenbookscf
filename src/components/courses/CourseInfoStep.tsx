import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ManualCourseData } from '@/hooks/useManualCourse';

interface Props {
  data: ManualCourseData;
  onChange: (d: ManualCourseData) => void;
  onNext: () => void;
}

export const CourseInfoStep: React.FC<Props> = ({ data, onChange, onNext }) => {
  const update = (partial: Partial<ManualCourseData>) => onChange({ ...data, ...partial });

  const isValid =
    data.name.trim().length >= 2 &&
    data.city.trim().length >= 2 &&
    data.slope > 0 &&
    data.rating > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nombre del campo</Label>
        <Input
          value={data.name}
          onChange={e => update({ name: e.target.value })}
          placeholder="Ej. Club de Golf Los Pinos"
          maxLength={100}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Ciudad</Label>
          <Input
            value={data.city}
            onChange={e => update({ city: e.target.value })}
            placeholder="Ej. Querétaro"
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label>País</Label>
          <Input
            value={data.country}
            onChange={e => update({ country: e.target.value })}
            placeholder="México"
            maxLength={40}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tee de salida</Label>
        <ToggleGroup
          type="single"
          value={data.teeName}
          onValueChange={v => v && update({ teeName: v })}
          className="justify-start"
        >
          <ToggleGroupItem value="blue" className="w-8 h-8 rounded-full bg-blue-600 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
          <ToggleGroupItem value="white" className="w-8 h-8 rounded-full bg-white border data-[state=on]:ring-2 ring-offset-2 ring-primary" />
          <ToggleGroupItem value="yellow" className="w-8 h-8 rounded-full bg-yellow-400 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
          <ToggleGroupItem value="red" className="w-8 h-8 rounded-full bg-red-500 data-[state=on]:ring-2 ring-offset-2 ring-primary" />
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Slope</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={data.slope || ''}
            onChange={e => update({ slope: Number(e.target.value) || 0 })}
            placeholder="113"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Rating</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={data.rating || ''}
            onChange={e => update({ rating: Number(e.target.value) || 0 })}
            placeholder="72.0"
          />
        </div>
      </div>

      <Button className="w-full" disabled={!isValid} onClick={onNext}>
        Continuar
      </Button>
    </div>
  );
};
