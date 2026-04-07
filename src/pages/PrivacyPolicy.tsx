import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import GreenBookLogo from '@/components/GreenBookLogo';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          ← Volver
        </Button>

        <div className="flex justify-center mb-6">
          <GreenBookLogo height={64} />
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">Política de Privacidad</h1>
        <p className="text-xs text-muted-foreground text-center mb-8">Última actualización: Abril 2026</p>

        <h2 className="text-lg font-semibold mt-6 mb-2">1. Responsable del tratamiento de datos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          GreenBook by SCF, accesible en golfgreenbookscf.com, es responsable del tratamiento de tus datos personales.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">2. Datos recopilados</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Recopilamos los siguientes datos: correo electrónico, nombre de usuario y scores de golf capturados en la plataforma. Adicionalmente, nuestro proveedor de autenticación recopila de forma automática metadata de sesión que puede incluir información del dispositivo y sistema operativo utilizado para acceder al servicio.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">3. Finalidad del tratamiento</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Los datos se utilizan exclusivamente para: gestión de tu cuenta de usuario, funcionamiento del servicio (registro de rondas y apuestas), soporte técnico, y comunicaciones de servicio. No utilizamos tus datos para fines de marketing sin tu consentimiento explícito.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">4. No venta de datos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          GreenBook no vende, arrienda, ni comparte datos personales con terceros para fines comerciales propios de dichos terceros.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">5. Proveedores de servicio (subencargados)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Utilizamos los siguientes proveedores que pueden tener acceso a datos para operar el servicio: infraestructura de base de datos y autenticación en la nube, Stripe (procesamiento de pagos), Sentry (monitoreo de errores técnicos). Cada proveedor cuenta con su propia política de privacidad y cumple con estándares de seguridad internacionales.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">6. Derechos ARCO (LFPDPPP)</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Conforme al artículo 22 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, tienes derecho a Acceder, Rectificar, Cancelar u Oponerte al tratamiento de tus datos personales (derechos ARCO). Para ejercer estos derechos, escríbenos a: soporte@golfgreenbookscf.com
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">7. Eliminación de cuenta y datos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Al eliminar tu cuenta, tus credenciales de acceso (email y contraseña) son eliminadas permanentemente de forma inmediata. El historial de rondas y apuestas en las que participaste se conserva de forma anonimizada — tu nombre es reemplazado por "Usuario eliminado" — para preservar el historial de los demás jugadores involucrados. Tus membresías activas en rankings son eliminadas.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">8. Retención de datos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Los datos de identificación personal se eliminan al momento de cancelar la cuenta. Los registros anonimizados de actividad se conservan para mantener la integridad del historial de otros usuarios.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">9. Seguridad</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Implementamos medidas técnicas de seguridad incluyendo conexiones cifradas HTTPS/TLS y control de acceso mediante Row Level Security en base de datos.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">10. Cambios a esta política</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Notificaremos cualquier cambio material a esta Política de Privacidad mediante correo electrónico con al menos 15 días de anticipación.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2">11. Contacto</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Para ejercer tus derechos o resolver dudas sobre privacidad: soporte@golfgreenbookscf.com
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
