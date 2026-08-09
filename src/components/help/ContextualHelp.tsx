import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Settings, Dices, RefreshCw, Trophy, BarChart3 } from 'lucide-react';
import CoinDollarIcon from '@/components/icons/CoinDollarIcon';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard' | 'bets' | 'handicaps' | 'leaderboards' | 'rankings' | 'stats';

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
      'PASO 1 — Campo y tee: selecciona el campo de golf y el color de tee (Azul, Blanco, Dorado, Rojo). El tee define rating y slope, base del cálculo de hándicaps, así que verifícalo antes de iniciar. Si no encuentras tu campo, usa la búsqueda y si aun así no aparece, agrégalo manualmente con sus pares y handicaps por hoyo.',
      'PASO 2 — Hoyos y salida: define si la ronda es de 18 o 9 hoyos y el hoyo de salida (1 o 10). Si salen del 10, la app remapea automáticamente Front y Back para que los segmentos se calculen correctamente.',
      'PASO 3 — Jugadores: agrega hasta 6 jugadores por grupo. Usa el botón de amigos (👥) para traer compañeros frecuentes con su hándicap ya guardado, o escribe el nombre para agregarlos como invitados. A cada jugador puedes cambiarle el tee individualmente si juega desde otro color.',
      'PASO 4 — Hándicaps (referencia): aquí solo se define el Índice de cada jugador. Si el jugador tiene cuenta, la app propone su Índice USGA ya calculado con su historial; si es invitado, el creador de la ronda lo captura a mano. Este número es la base de referencia, no el ajuste final: los strokes que se dan entre jugadores se revisan y ajustan en la pantalla de Hándicaps (ícono 🔄).',
      'PASO 5 — Crear e invitar: toca "Crear Ronda y Obtener Link, QR & Código" para guardar la ronda y compartirla. Quien entre con el link o el código queda vinculado a la misma ronda y ve los scores en tiempo real. Los invitados sin cuenta entran en modo lectura.',
      'PASO 6 — Grupos adicionales: ¿son más de 6 jugadores o quieren jugar por equipos? Usa el botón \'+\' para crear más grupos dentro de la misma ronda. El grupo 1 (organizador) define las reglas base; los demás grupos las heredan y pueden ajustar sus propios montos. Solo el organizador puede cerrar la ronda.',
      'PASO 7 — Iniciar: cuando el campo, el tee y los jugadores estén listos, toca "Iniciar Ronda". Después de iniciar aún puedes agregar jugadores o ajustar apuestas, pero conviene dejar la configuración cerrada antes del primer hoyo.',
      'Todo se guarda automáticamente: si cierras la app o cambias de teléfono, al volver retomas la ronda en el punto donde la dejaste.',
    ],
  },
  betsetup: {
    icon: <Dices className="h-5 w-5 text-primary" />,
    title: '🎲 Configuración de Apuestas',
    items: [
      'CÓMO CONFIGURAR: cada apuesta tiene un switch para activarla. Al activarla (o al tocar su nombre) la tarjeta se expande hacia abajo y ahí aparecen todos sus campos: montos por Front 9, Back 9 y Total 18, uso de hándicap, modalidades y la matriz de participación. Si no expandes la tarjeta, la apuesta queda con los montos por defecto — ábrela siempre para ajustar los importes.',
      'MATRIZ DE PARTICIPACIÓN: dentro de cada apuesta puedes decidir quién juega contra quién. Las matrices inician colapsadas; ábrelas para desactivar pares o jugadores que no entran en esa apuesta. Lo que quede marcado en la matriz es lo que se cobra, sin excepción.',
      'MONTOS POR PAR (override): el monto global de la apuesta aplica a todos. Si un par específico juega por otro importe, el override se hace en el Balance General: selecciona a los dos jugadores, abre el desglose de esa apuesta y edita ahí el monto de ese par. Ese valor manda sobre el global.',
      'Las apuestas se dividen en 3 categorías: navega entre Individuales, Parejas y Grupales con los tabs superiores.',
      'INDIVIDUALES — entre cada par de jugadores: Medal (menor neto gana Front, Back o Total), Skins (gana el hoyo quien hace menos; se acumula en empate), Presiones (match play con apuestas en cascada al ir arriba por 2), Match Play 18, Bloques, Rayas (contador de eventos ganados: Skins + Oyeses + Unidades + Medal), Unidades ⭐ (premios por birdie, águila, albatros, sandy par, hole out, aqua par), Manchas ⬛ (cobros por errores: doble OB, trampa, pinkies, paloma, retruje, moreliana...), Oyeses (par 3: quien queda más cerca al pin gana), Putts y Caros (match en los últimos hoyos, configurable).',
      'PAREJAS — entre equipos de 2 vs 2: Carritos (bola baja, bola alta o bola baja + bola alta), Presiones Parejas (en modalidad Match Play solo cuenta la bola baja del equipo y no se abren presiones), Loba 🐺 (el lobo elige compañero o va solo cada hoyo), Sixes (rotación de parejas cada 6 hoyos) y Las Vegas (puntaje combinado tipo dado). En Sixes y Vegas debes asignar las parejas de cada set antes de iniciar.',
      'PAREJA BASE (5 jugadores): cuando en Foursomes o Carritos participan exactamente 5 jugadores, aparece el bloque "Pareja base". Elige los 2 que se mantienen juntos y toca "Generar 3 matches": la app crea automáticamente los 3 encuentros de esa pareja contra todas las combinaciones de los otros 3 (A+B, A+C, B+C), copiando montos y modalidad de la apuesta ya configurada. Si ya había matches, puedes reemplazarlos o solo agregar los que falten, y después editar o eliminar cada uno libremente.',
      'GRUPALES — un ganador entre todos: Medal General, Stableford, Culebras (último con 3+ putts paga a todos), Pingüinos (último con triple bogey), Zoológico 🐾, Putts, Nines (5-3-1 por hoyo) y Coneja (acumulación progresiva por sets).',
      'Toca el ícono ℹ️ junto a cada apuesta para ver exactamente cómo se calcula y cuándo se cobra.',
      'PLANTILLAS: si siempre juegan lo mismo, guarda la configuración completa como plantilla y cárgala en la siguiente ronda con un toque — se aplican montos, modalidades y participaciones.',
      'Si algo queda incompleto (parejas sin asignar, participaciones vacías), la app te avisa con un mensaje al intentar iniciar. Puedes volver a esta pantalla y ajustar apuestas incluso con la ronda en curso.',
    ],
  },

  handicaps: {
    icon: <RefreshCw className="h-5 w-5 text-primary" />,
    title: '🔄 Matriz de Hándicaps',
    items: [
      'Esta es la pantalla donde se decide, de verdad, cuántos strokes se dan entre jugadores. El Índice capturado en el Setup solo sirve como punto de partida.',
      'CÓMO LEERLA: busca tu nombre en las filas (izquierda) y el de tu rival en las columnas. El número de esa celda son los strokes que TÚ le das a él: positivo = tú los das, negativo = él te los da a ti, 0 = juegan parejo (scratch).',
      'SLIDING AUTOMÁTICO: si ya jugaron rondas juntos, la app propone el ajuste según el historial de resultados de ese par (si le has ganado, sube lo que le das; si te ha ganado, baja). Es una propuesta, no una regla obligatoria.',
      'AJUSTE MANUAL: toca cualquier celda y escribe el número acordado. Tu valor manda sobre el sliding automático y es el que se usa en todas las apuestas con hándicap de la ronda.',
      'Puedes volver a esta pantalla y corregir valores incluso con la ronda en curso; los cálculos se recalculan al instante.',
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
      'SECCIÓN SUPERIOR — Balance General: el saldo neto de cada jugador, es decir lo que ganó o perdió contra todos los demás en conjunto. Al desplegar un jugador ves su resultado contra cada rival, ya con todo incluido: sus apuestas individuales más la parte que le corresponde de las apuestas de parejas y grupales.',
      'SEGUNDA SECCIÓN — detalle bilateral: toca un jugador para fijarlo como base y luego toca al rival contra quien quieres comparar. Se despliegan todas las apuestas que están jugando entre ellos, organizadas en Individuales (Medal, Skins, Presiones, Rayas, Unidades, Manchas, Oyeses, Coneja...), Parejas (Carritos, Presiones Parejas, Loba, Sixes, Vegas) y Grupales (Medal General, Stableford, Nines, Culebras, Pingüinos...).',
      'CAPAS Y TOOLTIPS: dentro del desglose puedes abrir cada apuesta para ver hoyo por hoyo cómo se resolvió, y los tooltips ℹ️ explican de dónde salió cada cantidad (quién ganó el hoyo, strokes de hándicap aplicados, carries acumulados, presiones abiertas). Es la vista donde se audita todo el resultado deportivo y económico de la ronda.',
      'OVERRIDE DE MONTO POR PAR: si dos jugadores acordaron un importe distinto al configurado de manera general, aquí mismo —en el desglose de ese par— editas el monto de esa apuesta. Ese valor manda sobre el monto global y solo afecta a esa bilateralidad.',
      'CANCELAR UNA APUESTA EN UN PAR: con la ✕ eliminas esa apuesta únicamente para ese par. Así el setup general se hace una sola vez para todos y aquí vas quitando las que algún par no juega entre sí — queda claro y rápido, sin tocar la configuración de los demás.',
      'AUDITORÍA DE HÁNDICAPS POR APUESTA: en el encabezado de cada tarjeta de Foursomes, Carritos, Sixes, Vegas y Nines hay un ícono ℹ️. Al tocarlo se muestra cómo se está jugando esa apuesta (Low Ball, High Ball, Combinado o Match Play, umbral de presión) y la modalidad de hándicap aplicada (Full Hándicap, Base Cero, Diferencial Equipo o Sliding Equipo, con medio punto si aplica), junto al tee y el hándicap de campo de cada jugador y los golpes exactos que recibe en esa apuesta. Son los mismos valores que usa el motor de cálculo, así que sirve para verificar las ventajas acordadas.',

    ],
  },
  leaderboards: {
    icon: <Trophy className="h-5 w-5 text-primary" />,
    title: '🏆 Leaderboards',
    items: [
      'Los Leaderboards son torneos o competencias entre amigos que abarcan múltiples rondas. Crea uno, comparte el código y los participantes se unen automáticamente.',
      'Al cerrar una ronda, puedes vincularla a un Leaderboard existente. Los scores de esa ronda se suman al ranking acumulado del torneo.',
      'Modos de scoring disponibles: Gross vs Par (score bruto contra par del campo), Net vs Par (ajustado por hándicap) y Stableford (puntos por hoyo).',
      'El ranking se actualiza en tiempo real conforme se vinculan rondas. Puedes ver la posición de cada participante, su mejor ronda y el promedio.',
    ],
  },
  rankings: {
    icon: <BarChart3 className="h-5 w-5 text-primary" />,
    title: '📊 Rankings',
    items: [
      'Los Rankings se dividen en dos pestañas: Scoring (hándicap y estadísticas) y Dinero (balances económicos entre jugadores).',
      'SCORING — muestra el Índice de Hándicap calculado con la fórmula USGA, el promedio de score gross y el mejor score de cada jugador. Se alimenta automáticamente de todas las rondas cerradas.',
      'DINERO — crea un Ranking de Dinero para tu grupo y agrega miembros. Cada ronda cerrada entre miembros del ranking alimenta automáticamente el balance bilateral (quién le debe a quién).',
      'Puedes filtrar los Rankings de Dinero por período: Histórico (todo), Año en curso o Rango personalizado de fechas. Toca un jugador para ver su desglose bilateral contra cada rival.',
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
