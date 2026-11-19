import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useClinicAuth } from '@/lib/auth';

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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-10">
          {clinicName ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Welcome, {clinicName}
              </h1>
              <p className="mt-3 text-slate-600">Your clinic workspace is ready.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/doctors"><Button type="button">Manage doctors</Button></Link>
                <Link to="/sessions"><Button type="button" variant="secondary">View sessions</Button></Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-700">{loadError ?? 'Loading clinic…'}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
