import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Hash, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

// Validation schema for the code
const codeSchema = z
  .string()
  .trim()
  .length(6, { message: 'El código debe tener 6 caracteres' })
  .regex(/^[A-Za-z0-9]+$/, { message: 'Solo letras y números permitidos' });

const JoinByCode = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphanumeric, max 6 chars, convert to uppercase
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    setCode(value);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = codeSchema.safeParse(code);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // The code is the first 6 chars of the round UUID (lowercase in DB)
      const { data: roundId, error: rpcError } = await supabase
        .rpc('resolve_round_id_by_code', { p_code: code });

      if (rpcError) throw rpcError;

      if (!roundId) {
        setError('No se encontró ninguna ronda con ese código');
        return;
      }

      navigate(`/join/${roundId}`);
    } catch (err) {
      console.error('Error searching for round:', err);
      setError('Error al buscar la ronda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto pt-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Hash className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Unirse con Código</CardTitle>
            <CardDescription>
              Ingresa el código de 6 caracteres que te compartieron
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="text"
                  placeholder="ABCD12"
                  value={code}
                  onChange={handleCodeChange}
                  className="text-center text-2xl font-mono font-bold tracking-[0.3em] uppercase h-14"
                  maxLength={6}
                  autoFocus
                  autoComplete="off"
                />
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  El código tiene 6 letras y números
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Buscar Ronda
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JoinByCode;