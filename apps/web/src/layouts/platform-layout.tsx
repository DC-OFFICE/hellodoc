import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BrandHeader } from '@/components/brand-header';
import { ModeToggle } from '@/components/mode-toggle';
import { PasswordField } from '@/components/password-field';
import { PlatformSidebar } from '@/components/platform-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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

function titleFromPath(pathname: string, clinicName: string | null) {
  if (pathname.startsWith('/platform-admin/specializations')) return 'Specializations';
  if (pathname.startsWith('/platform-admin/qualifications')) return 'Qualifications';
  if (pathname.startsWith('/platform-admin/sms-gateway')) return 'SMS gateway';
  if (/^\/platform-admin\/clinics\/[^/]+$/.test(pathname)) return clinicName ?? 'Clinic';
  return 'Clinics';
}

export function PlatformLayout() {
  const location = useLocation();
  const { user, loading, setUser } = usePlatformAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const clinicId = location.pathname.match(/^\/platform-admin\/clinics\/([^/]+)$/)?.[1] ?? null;
  const title = titleFromPath(location.pathname, clinicName);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!user || !clinicId) {
      setClinicName(null);
      return;
    }
    let cancelled = false;
    api<{ clinicName: string }>(`/platform/clinics/${clinicId}`)
      .then((clinic) => {
        if (!cancelled) setClinicName(clinic.clinicName);
      })
      .catch(() => {
        if (!cancelled) setClinicName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, clinicId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Verifying administrator session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <BrandHeader subtitle="Platform administration" />
        <main className="mx-auto max-w-md px-6 py-10 animate-rise">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold">Platform administrator login</h1>
              <p className="mt-2 text-sm text-muted-foreground">DartCodes internal access only.</p>
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
                {loginError ? <p className="text-sm text-destructive">{loginError}</p> : null}
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
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Platform
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs font-semibold tracking-[0.14em] text-foreground uppercase">
                  {title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 bg-muted/50 p-4 md:p-6 animate-rise">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
