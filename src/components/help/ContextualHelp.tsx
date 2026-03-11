import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Settings, Dices, RefreshCw, Trophy } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps' | 'leaderboards';

const helpContent: Record<string, { icon: React.ReactNode; title: string; items: string[] }> = {
  setup: {
    icon: <Settings className="h-5 w-5 text-primary" />,
    title: 'Configuración de Ronda',
    items: [
      'Selecciona el campo y el tee desde donde jugarán.',
      'Agrega jugadores manualmente o usa el botón de amigos para invitar a conocidos.',
      'Puedes tener hasta 6 jugadores por grupo.',
      'Crea la ronda para obtener un link, QR o código que tus compañeros pueden usar para unirse.',
      'Cuando todos estén listos, presiona "Iniciar Ronda".',
    ],
  },
  betsetup: {
    icon: <Dices className="h-5 w-5 text-primary" />,
    title: 'Configuración de Apuestas',
    items: [
      'Activa o desactiva cada tipo de apuesta: Medal, Skins, Presiones, Rayas, Manchas y más.',
      'Configura el monto de cada apuesta.',
      'Usa la matriz de participación para elegir quién juega qué apuesta.',
      'Las apuestas se calculan automáticamente al capturar scores.',
    ],
  },
  handicaps: {
    icon: <RefreshCw className="h-5 w-5 text-primary" />,
    title: 'Matriz de Hándicaps',
    items: [
      'Aquí ves los strokes que se dan entre cada par de jugadores.',
      'Los hándicaps se calculan automáticamente con base en el handicap de cada jugador y el slope del campo.',
      'Puedes ajustar manualmente los strokes si el grupo tiene un acuerdo diferente.',
      'El sliding se actualiza automáticamente entre rondas según resultados anteriores.',
    ],
  },
  scorecard: {
    icon: <Trophy className="h-5 w-5 text-primary" />,
    title: 'Scorecard',
    items: [
      'Captura los golpes y putts de cada jugador en cada hoyo.',
      'Los badges de birdie, eagle, cuatriput, 10+, etc. se detectan automáticamente.',
      'Puedes agregar marcadores manuales como sandy par, aqua par, doble OB y más.',
      'Confirma cada hoyo cuando todos los scores estén capturados.',
      'Desliza izquierda/derecha para moverte entre hoyos.',
    ],
  },
  bets: {
    icon: <CoinDollarIcon className="h-5 w-5 text-primary" />,
    title: 'Resultados y Apuestas',
    items: [
      'Ve la tabla general de quién le debe a quién.',
      'Toca un jugador para ver el desglose bilateral detallado.',
      'Los cálculos se actualizan en tiempo real conforme se capturan scores.',
      'Al cerrar la ronda, los balances se guardan en el historial.',
    ],
  },
};

interface ContextualHelpProps {
  view: AppView;
  open: boolean;
  onClose: () => void;
}

const ContextualHelp: React.FC<ContextualHelpProps> = ({ view, open, onClose }) => {
  const content = helpContent[view];
  if (!content) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            {content.icon}
            <SheetTitle>{content.title}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">Ayuda contextual</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-3">
          {content.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground/80">
              <span className="text-primary font-bold mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
};

export default ContextualHelp;
