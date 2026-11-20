import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';

type Settings = {
  enabled: boolean;
  bookingConfirmationEnabled: boolean;
  cancellationEnabled: boolean;
  rescheduleEnabled: boolean;
  approachingTurnEnabled: boolean;
  delayAlertEnabled: boolean;
  approachingThreshold: number;
  approvedSenderId: string | null;
  language: string;
};

export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<Settings>('/clinic/notification-settings');
        setSettings(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load settings');
      }
    })();
  }, []);

  if (error && !settings) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!settings) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const toggle = (key: keyof Settings) => {
    setSettings((s) => (s ? { ...s, [key]: !s[key] } : s));
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SMS notifications</h1>
        <p className="text-sm text-muted-foreground">
          Control which appointment events send SMS. Gateway credentials are managed by the platform.
        </p>
      </div>

      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <h2 className="font-semibold">Delivery</h2>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>SMS notifications enabled</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={() => toggle('enabled')}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Booking confirmation</span>
            <input
              type="checkbox"
              checked={settings.bookingConfirmationEnabled}
              onChange={() => toggle('bookingConfirmationEnabled')}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Cancellation</span>
            <input
              type="checkbox"
              checked={settings.cancellationEnabled}
              onChange={() => toggle('cancellationEnabled')}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Reschedule</span>
            <input
              type="checkbox"
              checked={settings.rescheduleEnabled}
              onChange={() => toggle('rescheduleEnabled')}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Approaching-turn alerts</span>
            <input
              type="checkbox"
              checked={settings.approachingTurnEnabled}
              onChange={() => toggle('approachingTurnEnabled')}
            />
          </label>
          <div>
            <Label htmlFor="threshold">Approaching threshold (patients ahead)</Label>
            <Input
              id="threshold"
              type="number"
              min={1}
              max={20}
              value={settings.approachingThreshold}
              onChange={(e) =>
                setSettings({ ...settings, approachingThreshold: Number(e.target.value) })
              }
            />
          </div>
          <label className="flex items-center justify-between gap-3">
            <span>Session delay alerts</span>
            <input
              type="checkbox"
              checked={settings.delayAlertEnabled}
              onChange={() => toggle('delayAlertEnabled')}
            />
          </label>
          <div>
            <Label>Approved sender ID</Label>
            <Input value={settings.approvedSenderId ?? 'Platform managed'} disabled />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {saved ? <p className="text-sm text-teal-700">{saved}</p> : null}
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              setSaved(null);
              try {
                const updated = await api<Settings>('/clinic/notification-settings', {
                  method: 'PATCH',
                  json: {
                    enabled: settings.enabled,
                    bookingConfirmationEnabled: settings.bookingConfirmationEnabled,
                    cancellationEnabled: settings.cancellationEnabled,
                    rescheduleEnabled: settings.rescheduleEnabled,
                    approachingTurnEnabled: settings.approachingTurnEnabled,
                    delayAlertEnabled: settings.delayAlertEnabled,
                    approachingThreshold: settings.approachingThreshold,
                  },
                });
                setSettings(updated);
                setSaved('Settings saved');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Save failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
