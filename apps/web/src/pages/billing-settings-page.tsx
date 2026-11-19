import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

type Settings = {
  displayName: string;
  address: string;
  contact: string;
  invoicePrefix: string;
  receiptPrefix: string;
  receiptFooter: string;
  taxRegistered: boolean;
  documentMode: string;
  accountantNote: string;
};

type Service = { id: string; code: string; name: string; price: string; active: boolean };

export function BillingSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [code, setCode] = useState('CONSULT');
  const [name, setName] = useState('General consultation');
  const [price, setPrice] = useState('0.00');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [nextSettings, nextServices] = await Promise.all([
      api<Settings>('/clinic/billing/settings'),
      api<{ items: Service[] }>('/clinic/billing/services'),
    ]);
    setSettings(nextSettings);
    setServices(nextServices.items);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Unable to load billing'));
  }, []);

  if (!settings) return <p className="text-sm text-slate-600">{error ?? 'Loading billing settings…'}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader><h1 className="text-xl font-semibold">Billing settings</h1></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">{settings.accountantNote}</p>
          <Label>Display name</Label>
          <Input value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} />
          <Label>Address</Label>
          <Input value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
          <Label>Contact</Label>
          <Input value={settings.contact} onChange={(e) => setSettings({ ...settings, contact: e.target.value })} />
          <Label>Receipt footer</Label>
          <Input value={settings.receiptFooter} onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })} />
          <p className="text-sm">Document mode: {settings.documentMode}. Currency: LKR. Tax registration: {settings.taxRegistered ? 'yes' : 'no'}.</p>
          <Button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const saved = await api<Settings>('/clinic/billing/settings', {
                  method: 'PATCH',
                  json: {
                    displayName: settings.displayName,
                    address: settings.address,
                    contact: settings.contact,
                    receiptFooter: settings.receiptFooter,
                  },
                });
                setSettings(saved);
                setMessage('Settings saved. Issued invoices keep their original snapshot.');
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Settings were not saved');
              }
            }}
          >
            Save settings
          </Button>
          {message ? <p className="text-sm text-teal-800">{message}</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader><h2 className="font-semibold">Services</h2></CardHeader>
          <CardContent className="space-y-3">
            {services.map((service) => (
              <p key={service.id} className="text-sm">{service.code} · {service.name} · LKR {service.price} · {service.active ? 'Active' : 'Inactive'}</p>
            ))}
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Label>Price (LKR)</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setError(null);
                try {
                  await api('/clinic/billing/services', { method: 'POST', json: { code, name, price } });
                  await reload();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Service was not added');
                }
              }}
            >
              Add service
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><h2 className="font-semibold">Invite cashier</h2></CardHeader>
          <CardContent className="space-y-3">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setError(null);
                try {
                  const result = await api<{ acceptUrl: string }>('/clinic/staff/cashier-invitations', {
                    method: 'POST',
                    json: { email },
                  });
                  setMessage(result.acceptUrl);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Invitation was not created');
                }
              }}
            >
              Send invitation
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
