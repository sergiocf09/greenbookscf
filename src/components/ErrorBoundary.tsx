import React from 'react';
import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.context ?? 'app'}]`, error, info);
    if (import.meta.env.PROD) {
      Sentry.captureException(error, {
        extra: {
          context: this.props.context,
          componentStack: info.componentStack,
        },
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Algo salió mal</h3>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message ?? 'Error inesperado'}
            </p>
          </div>
          <Button variant="outline" onClick={this.handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 bg-background">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <div className="text-center space-y-2 max-w-md">
          <h1 className="text-xl font-bold text-foreground">Error inesperado</h1>
          <p className="text-sm text-muted-foreground">
            Ocurrió un error. Si el problema persiste, cierra y vuelve a abrir la aplicación.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 p-3 bg-muted rounded text-xs text-left overflow-auto max-h-40">
              {String(error)}
            </pre>
          )}
        </div>
        <Button variant="outline" onClick={resetError}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reintentar
        </Button>
      </div>
    )}
  >
    {children}
  </Sentry.ErrorBoundary>
);
