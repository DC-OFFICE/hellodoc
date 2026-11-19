import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BrandHeader } from '@/components/brand-header';
import { PasswordField } from '@/components/password-field';
import { PlatformSidebar } from '@/components/platform-sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { api, ApiError } from '@/lib/api';
import { usePlatformAuth, type PlatformUser } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof loginSchema>;

function titleFromPath(pathname: string) {
  if (pathname.startsWith('/platform-admin/specializations')) return 'Specializations';
  if (pathname.startsWith('/platform-admin/qualifications')) return 'Qualifications';
  return 'Clinics';
}

export function PlatformLayout() {
  const location = useLocation();
  const { user, loading, setUser } = usePlatformAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  const title = titleFromPath(location.pathname);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Verifying administrator session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <BrandHeader subtitle="Platform administration" />
        <main className="mx-auto max-w-md px-6 py-10 animate-rise">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold">Platform administrator login</h1>
              <p className="mt-2 text-sm text-slate-600">DartCodes internal access only.</p>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(async (values) => {
                  setLoginError(null);
                  try {
                    const result = await api<{ user: PlatformUser }>('/platform-auth/login', {
                      method: 'POST',
                      json: values,
                    });
                    setUser(result.user);
                  } catch (error) {
                    setLoginError(error instanceof ApiError ? error.message : 'Login failed');
                  }
                })}
                noValidate
              >
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
                {loginError ? <p className="text-sm text-red-700">{loginError}</p> : null}
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

  return (
    <SidebarProvider>
      <PlatformSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border" />
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
            HelloDoc Platform / {title ?? 'Admin'}
          </p>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-6 animate-rise">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
