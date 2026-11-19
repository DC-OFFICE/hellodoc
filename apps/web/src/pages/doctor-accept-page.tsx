import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BrandHeader } from '@/components/brand-header';
import { PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

export function DoctorAcceptPage() {
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      <BrandHeader />
      <div className="mx-auto max-w-md px-4 py-10">
        <Card className="shadow-none">
          <CardHeader>
            <h1 className="text-xl font-semibold">Accept doctor invitation</h1>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {message ? <p className="text-sm text-teal-700">{message}</p> : null}
            <Button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  await api('/doctor/invitations/accept', {
                    method: 'POST',
                    json: { token: params.get('token') ?? '', name, password },
                  });
                  setMessage('Account linked. You can sign in as a doctor.');
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Invitation could not be accepted');
                }
              }}
            >
              Create doctor login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
