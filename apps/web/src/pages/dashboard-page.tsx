import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Receipt,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';
import { useClinicAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const shortcuts = [
  {
    title: 'Doctors',
    description: 'Manage clinic doctors and profiles',
    to: '/doctors',
    icon: Stethoscope,
  },
  {
    title: 'Sessions',
    description: 'Schedule and open clinic sessions',
    to: '/sessions',
    icon: CalendarClock,
  },
  {
    title: 'Patients',
    description: 'Find and register patients',
    to: '/patients',
    icon: Users,
  },
  {
    title: 'Invoices',
    description: 'Review billing and collections',
    to: '/billing/invoices',
    icon: Receipt,
  },
] as const;

export function DashboardPage() {
  const { user } = useClinicAuth();
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ clinicName: string }>('/clinic/me')
      .then((me) => {
        if (!cancelled) {
          setClinicName(me.clinicName);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClinicName(user?.clinicName ?? null);
          setLoadError(user?.clinicName ? null : 'Unable to load clinic workspace');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!clinicName) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">{loadError ?? 'Loading clinic…'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-2 pb-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-2xl md:text-3xl">Welcome, {clinicName}</CardTitle>
            <CardDescription>Your clinic workspace is ready.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/doctors">Manage doctors</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/sessions">View sessions</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-sm text-muted-foreground">
            Signed in as {user?.name ?? 'staff'} · keep patient care, sessions, and billing in one place.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((item) => (
          <Link key={item.to} to={item.to} className="group block">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardHeader className="pb-3">
                <div
                  className={cn(
                    'mb-3 flex size-9 items-center justify-center rounded-lg',
                    'bg-primary/10 text-primary',
                  )}
                >
                  <item.icon className="size-4" />
                </div>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  {item.title}
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
