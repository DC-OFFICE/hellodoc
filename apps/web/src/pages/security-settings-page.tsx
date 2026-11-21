import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

export function SecuritySettingsPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const copySecret = () => {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="max-w-lg shadow-none">
      <CardHeader>
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          Account Security & Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Multi-factor authentication (TOTP) adds an essential layer of security to protect patient and clinical records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground text-xs leading-relaxed">
          When mandatory 2FA is required on live servers, staff must confirm an authenticator code before accessing patient, consultation, and billing data.
        </p>

        {!secret && recoveryCodes.length === 0 ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={async () => {
              setError(null);
              try {
                const result = await api<{ otpauthUrl: string; secret: string }>('/clinic-auth/mfa/enroll', {
                  method: 'POST',
                  json: {},
                });
                setSecret(result.secret);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Enrollment failed');
              }
            }}
          >
            <KeyRound className="mr-1.5 size-4" />
            Start authenticator setup
          </Button>
        ) : null}

        {secret ? (
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                1. Add Secret Key to Authenticator App
              </span>
              <p className="text-xs text-muted-foreground">
                Enter this key into Google Authenticator, 1Password, Microsoft Authenticator, or Authy:
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5">
              <code className="font-mono text-sm font-bold text-foreground tracking-wider select-all break-all">
                {secret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={copySecret}
              >
                {copied ? <Check className="size-3.5 mr-1 text-emerald-500" /> : <Copy className="size-3.5 mr-1" />}
                {copied ? 'Copied' : 'Copy Key'}
              </Button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/60">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                2. Enter 6-Digit Code to Verify
              </span>
              <div className="flex gap-2">
                <Input
                  className="h-9 font-mono tracking-widest text-center font-bold"
                  value={code}
                  onChange={(event) => setCode(event.target.value.trim())}
                  placeholder="000000"
                  maxLength={6}
                />
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={code.length < 6}
                  onClick={async () => {
                    setError(null);
                    try {
                      const result = await api<{ enabled: boolean; recoveryCodes?: string[] }>(
                        '/clinic-auth/mfa/confirm',
                        {
                          method: 'POST',
                          json: { code },
                        },
                      );
                      setRecoveryCodes(result.recoveryCodes ?? []);
                      setSecret(null);
                      setMessage(
                        'Authenticator successfully enabled! Your previous session has been signed out. Please sign in again with your password and new authenticator code.',
                      );
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Code was not accepted');
                    }
                  }}
                >
                  Confirm & Enable
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {recoveryCodes.length > 0 ? (
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-4 space-y-2">
            <p className="font-semibold text-teal-900 dark:text-teal-200">Save Your One-Time Recovery Codes</p>
            <p className="text-xs text-muted-foreground">
              Keep these emergency recovery codes in a safe place. Each code can be used once if you lose your phone:
            </p>
            <ul className="grid grid-cols-2 gap-1.5 font-mono text-xs text-foreground bg-background/80 p-2.5 rounded border">
              {recoveryCodes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="pt-2">
              <Button asChild size="sm" className="w-full">
                <Link to="/login">Sign In Again</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {message ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="pt-4 border-t border-border space-y-2">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Turn off authenticator</p>
          <p className="text-xs text-muted-foreground">
            Enter your account password and a fresh 6-digit code or recovery code.
          </p>
          <div className="space-y-2 max-w-sm">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
            />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit authenticator or recovery code"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!password || !code}
              onClick={async () => {
                setError(null);
                try {
                  await api('/clinic-auth/mfa/disable', { method: 'POST', json: { password, code } });
                  setRecoveryCodes([]);
                  setMessage('Authenticator disabled. You may now sign in with your password alone.');
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Could not turn off authenticator');
                }
              }}
            >
              Turn off and sign out
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
