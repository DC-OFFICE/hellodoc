import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export type GatewayConfig = {
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gateway: GatewayConfig;
  onSaveSuccess: (updated: GatewayConfig) => void;
};

export function SmsGatewayConfigDialog({ open, onOpenChange, gateway, onSaveSuccess }: Props) {
  const [form, setForm] = useState<GatewayConfig>(gateway);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(gateway);
      setApiKey('');
      setError(null);
      setTestResult(null);
    }
  }, [open, gateway]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      const updated = await api<GatewayConfig>('/platform/sms-gateway', {
        method: 'PUT',
        json: {
          enabled: form.enabled,
          baseUrl: form.baseUrl.trim(),
          userId: form.userId.trim(),
          senderId: form.senderId.trim(),
          connectionTimeoutMs: Number(form.connectionTimeoutMs),
          readTimeoutMs: Number(form.readTimeoutMs),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      });
      onSaveSuccess(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save SMS gateway');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      // If user typed a new key or config, save first or test directly
      const result = await api<{ ok: boolean; message: string }>('/platform/sms-gateway/test', {
        method: 'POST',
        json: {},
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof ApiError ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configure SMS Gateway</DialogTitle>
          <DialogDescription>
            HelloDoc uses SMSLenz to deliver automated appointment confirmations, reminders, and queue updates.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
                testResult.ok
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertCircle className="size-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/40">
            <div className="space-y-0.5">
              <Label htmlFor="dlg-sms-enabled" className="text-sm font-medium">
                SMS Dispatch Master Switch
              </Label>
              <p className="text-xs text-muted-foreground">
                When disabled, new messages are recorded as skipped and will not be dispatched.
              </p>
            </div>
            <Switch
              id="dlg-sms-enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((curr) => ({ ...curr, enabled: checked }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dlg-sms-base">Base URL</Label>
            <Input
              id="dlg-sms-base"
              placeholder="https://smslenz.lk"
              value={form.baseUrl}
              onChange={(e) => setForm((curr) => ({ ...curr, baseUrl: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dlg-sms-user">User ID</Label>
              <Input
                id="dlg-sms-user"
                placeholder="1862"
                value={form.userId}
                onChange={(e) => setForm((curr) => ({ ...curr, userId: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-sms-sender">Sender ID</Label>
              <Input
                id="dlg-sms-sender"
                placeholder="DARTCODES"
                value={form.senderId}
                onChange={(e) => setForm((curr) => ({ ...curr, senderId: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dlg-sms-conn-to">Connection Timeout (ms)</Label>
              <Input
                id="dlg-sms-conn-to"
                type="number"
                min={1000}
                max={120000}
                value={form.connectionTimeoutMs}
                onChange={(e) =>
                  setForm((curr) => ({ ...curr, connectionTimeoutMs: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlg-sms-read-to">Read Timeout (ms)</Label>
              <Input
                id="dlg-sms-read-to"
                type="number"
                min={1000}
                max={120000}
                value={form.readTimeoutMs}
                onChange={(e) =>
                  setForm((curr) => ({ ...curr, readTimeoutMs: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="dlg-sms-key">API Key</Label>
              {form.apiKeySet && (
                <span className="text-xs text-muted-foreground">
                  Saved key: <span className="font-mono">{form.apiKeyMask ?? '••••'}</span>
                </span>
              )}
            </div>
            <Input
              id="dlg-sms-key"
              type="password"
              autoComplete="new-password"
              placeholder={form.apiKeySet ? 'Leave blank to keep existing key' : 'Paste SMSLenz API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={saving || testing}
            onClick={() => void handleTest()}
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test connection'
            )}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
