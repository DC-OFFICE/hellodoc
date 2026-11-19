import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

export function SecuritySettingsPage() {
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');

  return (
    <Card className="max-w-lg shadow-none">
      <CardHeader>
        <h1 className="text-xl font-semibold">Account security</h1>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Turn on an authenticator code before this account is used with real patient or payment records.
          Production clinics should set MFA as required.
        </p>
        <Button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              const result = await api<{ otpauthUrl: string; secret: string }>('/clinic-auth/mfa/enroll', {
                method: 'POST',
                json: {},
              });
              setOtpauthUrl(result.otpauthUrl);
              setSecret(result.secret);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Enrollment failed');
            }
          }}
        >
          Start authenticator setup
        </Button>
        {secret ? <p>Manual key: {secret}</p> : null}
        {otpauthUrl ? <p className="break-all text-slate-600">{otpauthUrl}</p> : null}
        <input
          className="w-full rounded-md border px-3 py-2"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="6-digit code"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            setError(null);
            try {
              const result = await api<{ enabled: boolean; recoveryCodes?: string[] }>('/clinic-auth/mfa/confirm', {
                method: 'POST',
                json: { code },
              });
              setRecoveryCodes(result.recoveryCodes ?? []);
              setMessage('Authenticator is enabled. These recovery codes are shown once. Sign in again; this session has been ended.');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Code was not accepted');
            }
          }}
        >
          Confirm code
        </Button>
        {recoveryCodes.length > 0 ? (
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="font-medium">Recovery codes</p>
            <ul className="mt-2 font-mono text-xs">
              {recoveryCodes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="pt-2 font-medium">Turn off authenticator</p>
        <p>Enter the account password and a fresh authenticator code, or one unused recovery code. This signs the account out.</p>
        <input
          className="w-full rounded-md border px-3 py-2"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            setError(null);
            try {
              await api('/clinic-auth/mfa/disable', { method: 'POST', json: { password, code } });
              setRecoveryCodes([]);
              setMessage('Authenticator is off. Sign in again with the password.');
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not turn off authenticator');
            }
          }}
        >
          Turn off and sign out
        </Button>
        {message ? <p className="text-teal-800">{message}</p> : null}
        {error ? <p className="text-red-700">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
