import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ManualCourseData, emptyManualCourse, useManualCourse } from '@/hooks/useManualCourse';
import { CourseInfoStep } from './CourseInfoStep';
import { HolesEntryStep } from './HolesEntryStep';
import { CourseReviewStep } from './CourseReviewStep';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (courseId: string) => void;
}

export const AddManualCourseDialog: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [data, setData] = useState<ManualCourseData>(emptyManualCourse());
  const { saving, saveCourse } = useManualCourse();

  const handleReset = () => {
    setStep(1);
    setData(emptyManualCourse());
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) handleReset();
    onOpenChange(v);
  };

  const handleSave = async () => {
    const id = await saveCourse(data);
    if (id) {
      onCreated?.(id);
      handleOpenChange(false);
    }
  };

  const titles: Record<number, string> = {
    1: 'Nuevo Campo Manual',
    2: 'Configurar Hoyos',
    3: 'Revisar Campo',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titles[step]}</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <CourseInfoStep
            data={data}
            onChange={setData}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <HolesEntryStep
            data={data}
            onChange={setData}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <CourseReviewStep
            data={data}
            saving={saving}
            onBack={() => setStep(2)}
            onSave={handleSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
