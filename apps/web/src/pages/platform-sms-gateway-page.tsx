import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';

type Gateway = {
  enabled: boolean;
  baseUrl: string;
  userId: string;
  senderId: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
  apiKeySet: boolean;
  apiKeyMask: string | null;
  updatedAt: string | null;
};

const empty: Gateway = {
  enabled: false,
  baseUrl: 'https://smslenz.lk',
  userId: '',
  senderId: '',
  connectionTimeoutMs: 30000,
  readTimeoutMs: 30000,
  apiKeySet: false,
  apiKeyMask: null,
  updatedAt: null,
};

export function PlatformSmsGatewayPage() {
  const [gateway, setGateway] = useState<Gateway>(empty);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<Gateway>('/platform/sms-gateway');
        setGateway(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load SMS gateway');
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api<Gateway>('/platform/sms-gateway', {
        method: 'PUT',
        json: {
          enabled: gateway.enabled,
          baseUrl: gateway.baseUrl,
          userId: gateway.userId,
          senderId: gateway.senderId,
          connectionTimeoutMs: Number(gateway.connectionTimeoutMs),
          readTimeoutMs: Number(gateway.readTimeoutMs),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      });
      setGateway(updated);
      setApiKey('');
      setNotice(updated.enabled ? 'SMS gateway saved and enabled for every clinic.' : 'SMS gateway saved. Sending is off.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ ok: boolean; message: string }>('/platform/sms-gateway/test', {
        method: 'POST',
        json: {},
      });
      if (result.ok) setNotice(result.message);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connection test failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">SMS gateway</h1>
        <p className="text-sm text-muted-foreground">
          One SMSLenz account for every clinic. Turning this off records new messages as skipped and does not send them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>SMSLenz</CardTitle>
              <CardDescription>
                {gateway.apiKeySet
                  ? `API key saved (${gateway.apiKeyMask ?? 'set'})`
                  : 'No API key saved yet'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sms-enabled">Enabled</Label>
              <Switch
                id="sms-enabled"
                checked={gateway.enabled}
                onCheckedChange={(checked) => setGateway((current) => ({ ...current, enabled: checked }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sms-base">Base URL</Label>
            <Input
              id="sms-base"
              value={gateway.baseUrl}
              onChange={(e) => setGateway((current) => ({ ...current, baseUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-user">User ID</Label>
            <Input
              id="sms-user"
              value={gateway.userId}
              onChange={(e) => setGateway((current) => ({ ...current, userId: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-sender">Sender ID</Label>
            <Input
              id="sms-sender"
              value={gateway.senderId}
              onChange={(e) => setGateway((current) => ({ ...current, senderId: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-connect">Connection timeout (ms)</Label>
            <Input
              id="sms-connect"
              type="number"
              min={1000}
              max={120000}
              value={gateway.connectionTimeoutMs}
              onChange={(e) =>
                setGateway((current) => ({ ...current, connectionTimeoutMs: Number(e.target.value) }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sms-read">Read timeout (ms)</Label>
            <Input
              id="sms-read"
              type="number"
              min={1000}
              max={120000}
              value={gateway.readTimeoutMs}
              onChange={(e) =>
                setGateway((current) => ({ ...current, readTimeoutMs: Number(e.target.value) }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sms-key">API key</Label>
            <Input
              id="sms-key"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep the saved key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          {notice ? <p className="text-sm text-primary sm:col-span-2">{notice}</p> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void testConnection()}>
              Test connection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
