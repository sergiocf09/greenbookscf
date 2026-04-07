import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import GreenBookLogo from '@/components/GreenBookLogo';

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} className="mb-4">
          ← Volver
        </Button>

        <div className="flex justify-center mb-6">
          <GreenBookLogo height={64} />
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">Términos de Servicio</h1>
        <p className="text-xs text-muted-foreground text-center mb-8">Última actualización: Abril 2026</p>

        <h2 className="text-lg font-semibold mt-6 mb-2">1. Descripción del servicio</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          GreenBook es una herramienta digital de registro de rondas y apuestas de golf. No es una casa de apuestas, casino, ni intermediario financiero. Las apuestas registradas en la plataforma son acuerdos privados y voluntarios entre los propios usuarios. GreenBook no intermedia, no custodia, ni facilita transferencias de dinero entre jugadores.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">2. Edad mínima</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          El uso de GreenBook está prohibido para menores de 18 años. Al crear una cuenta, el usuario confirma tener 18 años de edad o más.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">3. Cuentas y responsabilidad del usuario</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso. GreenBook no se hace responsable por disputas económicas entre jugadores derivadas de las apuestas registradas en la plataforma.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">4. Suscripción y pagos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Los planes de suscripción (Semestral $599 MXN y Anual $999 MXN) son pagos únicos procesados por Stripe. No existe renovación automática. El usuario recibirá un aviso de vencimiento 30 días antes de la fecha de expiración con un enlace para renovar. No se realizan reembolsos una vez iniciado el período de suscripción activo.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">5. Cancelación de cuenta</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          El usuario puede solicitar la eliminación de su cuenta en cualquier momento desde Configuración → Perfil → Eliminar mi cuenta. Al eliminar la cuenta, las credenciales de acceso son eliminadas permanentemente. El historial de rondas y apuestas en las que participó se conserva de forma anonimizada para no afectar el historial de otros jugadores involucrados.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">6. Limitación de responsabilidad</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          GreenBook no garantiza disponibilidad continua ininterrumpida del servicio. La responsabilidad máxima de GreenBook ante cualquier reclamación se limita al monto pagado por el usuario en su período de suscripción vigente.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">7. Ley aplicable y jurisdicción</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Estos Términos de Servicio se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a la jurisdicción de los tribunales competentes de la Ciudad de México.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">8. Contacto</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Para consultas legales: soporte@golfgreenbookscf.com
        </p>
      </div>
    </div>
  );
};

export default TermsOfService;
