import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Tag } from 'lucide-react';
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

  if (!settings) return <p className="text-sm text-muted-foreground">{error ?? 'Loading billing settings…'}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader><h1 className="text-xl font-semibold">Billing settings</h1></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{settings.accountantNote}</p>
          <Label>Display name</Label>
          <Input value={settings.displayName} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} />
          <Label>Address</Label>
          <Input value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
          <Label>Contact</Label>
          <Input value={settings.contact} onChange={(e) => setSettings({ ...settings, contact: e.target.value })} />
          <Label>Receipt footer</Label>
          <Input value={settings.receiptFooter} onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })} />
          <p className="text-sm text-muted-foreground">Document mode: {settings.documentMode}. Currency: LKR. Tax registration: {settings.taxRegistered ? 'yes' : 'no'}.</p>
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
          {message ? <p className="text-sm text-primary">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Tag className="size-4 text-primary" />
              Services Catalog
            </h2>
            <Button variant="outline" size="sm" asChild>
              <Link to="/billing/services" className="gap-1.5">
                Manage Services
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A dedicated page is available with KPI cards, multi-item table, edit, and deletion options.
            </p>
            {services.slice(0, 5).map((service) => (
              <div key={service.id} className="flex items-center justify-between text-sm py-1 border-b last:border-b-0">
                <span className="font-medium">{service.name} <span className="font-mono text-xs text-muted-foreground">({service.code})</span></span>
                <span className="font-semibold">LKR {Number(service.price).toFixed(2)}</span>
              </div>
            ))}
            {services.length > 5 && (
              <p className="text-xs text-muted-foreground pt-1">
                + {services.length - 5} more service{services.length - 5 === 1 ? '' : 's'}. View all in Services page.
              </p>
            )}
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
