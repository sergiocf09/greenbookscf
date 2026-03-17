import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Settings, Dices, RefreshCw, Trophy } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps' | 'leaderboards';

const helpContent: Record<string, { icon: React.ReactNode; title: string; items: string[] }> = {
  scoring: {
    icon: <Settings className="h-5 w-5 text-primary" />,
    title: '📓 Captura de Scores',
    items: [
      'Navega entre hoyos tocando el número en la barra superior. Los hoyos confirmados aparecen en verde.',
      'Para cada jugador ingresa los golpes (strokes) y los putts del hoyo. Los badges de birdie 🐦, águila 🦅 y doble dígito 🔟 se detectan automáticamente al capturar.',
      'Toca el ícono de marcadores junto a cada jugador para registrar manualmente: Sandy Par 🏖️, Aqua Par 💧, Hole Out 🎯, Doble OB 🚫, Trampa ⚠️, Pinkies 👠, Paloma 💨, Retruje ↩️, Moreliana 🎭 y más.',
      'En hoyos par 3, si la apuesta de Oyeses está activa aparece el botón 🎯 flotante — tócalo para registrar el orden de proximidad al pin de todos los jugadores.',
      'Cuando estén capturados todos los golpes y putts del hoyo, toca "Confirmar Scores del Hoyo" — solo los hoyos confirmados entran al cálculo de apuestas. Al confirmar, avanzas automáticamente al siguiente hoyo sin confirmar.',
      'Usa los botones "← Ant" y "Sig →" para moverte entre hoyos, o toca directamente el número en la barra de navegación.',
      'Si hay grupos adicionales en la ronda, aparece un selector arriba para cambiar de grupo y capturar sus scores.',
      'El botón 💲 permite agregar Side Bets manuales para apuestas extra no contempladas en la configuración. El botón 🐾 registra incidencias del Zoológico si esa apuesta está activa.',
    ],
  },
  setup: {
    icon: <Settings className="h-5 w-5 text-primary" />,
    title: '⚙️ Configuración de Ronda',
    items: [
      'Selecciona el campo de golf y el color de tee desde donde juegan.',
      'Agrega hasta 6 jugadores por grupo. Usa el botón de amigos (ícono 👥 en el header) para agregar compañeros frecuentes sin teclear su nombre.',
      '¿Son más de 6 o quieren organizarse en equipos? Usa el botón \'+\' para crear grupos adicionales dentro de la misma ronda — pueden tener apuestas compartidas entre grupos.',
    ],
  },
  betsetup: {
    icon: <Dices className="h-5 w-5 text-primary" />,
    title: '🎲 Configuración de Apuestas',
    items: [
      'Las apuestas se dividen en 3 categorías: navega entre Individuales, Parejas y Grupales con los tabs superiores.',
      'INDIVIDUALES — entre cada par de jugadores: Medal (menor neto gana Front, Back o Total), Skins (gana el hoyo quien hace menos; se acumula en empate), Presiones (match play con apuestas en cascada al ir arriba por 2), Rayas (contador de eventos ganados: Skins + Oyeses + Unidades + Medal), Unidades (premios por birdie, águila, albatros, sandy par, hole out, aqua par), Manchas (cobros por errores: doble OB, trampa, pinkies, paloma, retruje, moreliana...), Oyeses (par 3: quien queda más cerca al pin gana), Caros (match en los últimos 4 hoyos, configurable).',
      'PAREJAS — entre equipos de 2 vs 2: Carritos (lowball, highball o combined) y Presiones Parejas.',
      'GRUPALES — un ganador entre todos: Medal General (menor neto total), Stableford (puntos por hoyo), Culebras (último en tener 3+ putts paga a todos), Pingüinos (último en tener triple bogey paga a todos), Zoológico, Putts.',
      'Toca el ícono ℹ️ junto a cada apuesta para ver exactamente cómo funciona y cuándo se cobra.',
    ],
  },
  handicaps: {
    icon: <RefreshCw className="h-5 w-5 text-primary" />,
    title: '🔄 Matriz de Hándicaps',
    items: [
      'Muestra los strokes que se dan entre cada par de jugadores para emparejar el juego.',
      'Cómo leerla: encuentra tu nombre en las filas (lado izquierdo) y el de tu rival en las columnas. El número en esa celda son los strokes que tú le das a él. Positivo = tú das strokes. Negativo = él te los da a ti.',
      'Sliding automático: si ya jugaron rondas juntos anteriormente, el sistema ajusta los strokes según el historial de resultados. Puedes verificar o corregir cualquier valor manualmente.',
    ],
  },
  scorecard: {
    icon: <Trophy className="h-5 w-5 text-primary" />,
    title: '🏆 Scorecard',
    items: [
      'El botón flotante 📓 con el número del hoyo actual está siempre visible — úsalo para ir a la pantalla de captura donde ingresas golpes y putts de todos los jugadores y confirmas el hoyo.',
      'El ícono ⚡ junto al nombre de cada jugador permite captura rápida de su score sin salir del scorecard.',
      'El botón 🏆 Leaderboard muestra el ranking en tiempo real de todos los jugadores de la ronda, ya sea que haya uno o varios grupos.',
      'En hoyos par 3 con la apuesta de Oyeses activa, aparece un ícono flotante especial para registrar la proximidad al pin de cada jugador — tócalo al terminar el hoyo.',
      'El ícono de tu avatar en la esquina superior derecha del header abre el menú de perfil con acceso a todas las funciones adicionales de la app.',
    ],
  },
  bets: {
    icon: <CoinDollarIcon className="h-5 w-5 text-primary" />,
    title: '💰 Balance General',
    items: [
      'El Balance General muestra el saldo neto de cada jugador — lo que ganó o perdió contra todos los demás combinado.',
      'Para ver el detalle: toca un jugador para seleccionarlo como base, luego toca a su rival. Verás el desglose completo de todas las apuestas entre esos dos.',
      'El desglose está organizado en tres secciones: Individuales (Medal, Skins, Presiones, etc.), Parejas (Carritos, Presiones Parejas) y Grupales (Medal General, Stableford, etc.).',
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
      <SheetContent side="top" className="rounded-b-2xl mt-14 max-h-[80vh] overflow-y-auto">
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
