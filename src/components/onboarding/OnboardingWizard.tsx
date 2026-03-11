import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Dices, Trophy } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';
import GreenBookLogo from '@/components/GreenBookLogo';

const steps = [
  {
    icon: <GreenBookLogo className="h-16 w-16" />,
    title: 'Bienvenido a GreenBooks CF',
    description: 'La forma más fácil de llevar tus rondas y apuestas de golf.',
  },
  {
    icon: <Settings className="h-12 w-12 text-primary" />,
    title: 'Setup',
    description: 'Elige el campo, el tee y agrega a tus compañeros de juego.',
  },
  {
    icon: <Dices className="h-12 w-12 text-primary" />,
    title: 'Apuestas',
    description: 'Configura qué apuestas van en la ronda: Medal, Skins, Presiones, Rayas y más.',
  },
  {
    icon: <Trophy className="h-12 w-12 text-primary" />,
    title: 'Scorecard',
    description: 'Captura los golpes y putts de cada hoyo en tiempo real.',
  },
  {
    icon: <CoinDollarIcon className="h-12 w-12 text-primary" />,
    title: 'Resultados',
    description: 'Ve quién le debe a quién al terminar la ronda, con el desglose completo.',
  },
];

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  const handleFinish = () => {
    localStorage.setItem('gbcf_onboarding_done', 'true');
    onClose();
  };

  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleFinish(); }}>
      <DialogContent className="max-w-sm p-0 border-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex flex-col items-center justify-center min-h-[380px] px-8 py-10 text-center bg-background">
          {/* Icon */}
          <div className="mb-6 flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10">
            {steps[step].icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground mb-2">{steps[step].title}</h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
            {steps[step].description}
          </p>

          {/* Dot indicators */}
          <div className="flex gap-2 mt-8 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 w-full">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
                Anterior
              </Button>
            )}
            {isLast ? (
              <Button onClick={handleFinish} className="flex-1">
                ¡Empezar!
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} className="flex-1">
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;
