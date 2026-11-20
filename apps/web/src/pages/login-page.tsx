import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BrandHeader } from '@/components/brand-header';
import { PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { useClinicAuth, type ClinicUser } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, setUser } = useClinicAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (!loading && user) {
    const home =
      user.role === 'clinic_doctor'
        ? '/doctor/worklist'
        : user.role === 'clinic_cashier'
          ? '/billing/invoices'
          : user.role === 'clinic_receptionist'
            ? '/patients'
            : '/dashboard';
    return <Navigate to={home} replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await api<{ user?: ClinicUser; mfaRequired?: boolean; mfaToken?: string }>(
        '/clinic-auth/login',
        { method: 'POST', json: values },
      );
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        return;
      }
      if (!result.user) throw new Error('Login failed');
      setUser(result.user);
      navigate(
        result.user.role === 'clinic_doctor'
          ? '/doctor/worklist'
          : result.user.role === 'clinic_cashier'
            ? '/billing/invoices'
            : result.user.role === 'clinic_receptionist'
              ? '/patients'
              : '/dashboard',
        { replace: true },
      );
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Login failed');
    }
  });

  return (
    <div className="min-h-screen">
      <BrandHeader
        right={
          <Link to="/register">
            <Button variant="outline" type="button">Register</Button>
          </Link>
        }
      />
      <main className="mx-auto max-w-md px-6 py-10 animate-rise">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold text-foreground">Clinic login</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with an approved clinic staff account.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" {...form.register('email')} />
              </div>
              <PasswordField
                id="password"
                label="Password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {mfaToken ? (
                <div className="space-y-3">
                  <Label htmlFor="mfa">Authentication code</Label>
                  <Input
                    id="mfa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={async () => {
                      setServerError(null);
                      try {
                        const result = await api<{ user: ClinicUser }>('/clinic-auth/mfa/verify', {
                          method: 'POST',
                          json: { mfaToken, code: mfaCode },
                        });
                        setUser(result.user);
                        navigate(
                          result.user.role === 'clinic_doctor'
                            ? '/doctor/worklist'
                            : result.user.role === 'clinic_cashier'
                              ? '/billing/invoices'
                              : result.user.role === 'clinic_receptionist'
                                ? '/patients'
                                : '/dashboard',
                          { replace: true },
                        );
                      } catch (error) {
                        setServerError(error instanceof ApiError ? error.message : 'Code was not accepted');
                      }
                    }}
                  >
                    Verify code
                  </Button>
                </div>
              ) : null}
              {serverError ? <p className="text-sm text-red-700">{serverError}</p> : null}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
