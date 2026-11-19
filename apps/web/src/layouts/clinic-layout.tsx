import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { api } from '@/lib/api';
import { useClinicAuth } from '@/lib/auth';

export function ClinicLayout({ title }: { title?: string }) {
  const { user, loading } = useClinicAuth();
  const [clinicName, setClinicName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ clinicName: string }>('/clinic/me')
      .then((me) => {
        if (!cancelled) setClinicName(me.clinicName);
      })
      .catch(() => {
        if (!cancelled) setClinicName(user.clinicName);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Verifying session…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <AppSidebar clinicName={clinicName} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border" />
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
            {title === 'Sessions' ||
            title === 'Doctors' ||
            title === 'Patients' ||
            title === 'Appointments'
              ? `Clinic Management / ${title}`
              : `HelloDoc / ${title ?? 'Clinic'}`}
          </p>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-6 animate-rise">
          <Outlet context={{ clinicName }} />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
