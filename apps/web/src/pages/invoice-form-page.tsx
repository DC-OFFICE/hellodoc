import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

type Patient = { id: string; fullName: string; patientNumber: string };
type Service = { id: string; name: string; price: string; active: boolean };

export function InvoiceFormPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patientId, setPatientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('0.00');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: Patient[] }>('/clinic/patients?limit=50&status=ACTIVE').then((data) => {
      setPatients(data.items);
    });
    void api<{ items: Service[] }>('/clinic/billing/services').then((data) => {
      const active = data.items.filter((item) => item.active);
      setServices(active);
      if (active[0]) setServiceId(active[0].id);
    });
  }, []);

  return (
    <Card className="max-w-xl shadow-none">
      <CardHeader>
        <h1 className="text-xl font-semibold">New invoice</h1>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Patient</Label>
          <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Select a patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.fullName} · {patient.patientNumber}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Appointment ID (optional)</Label>
          <Input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} />
        </div>
        <div>
          <Label>Service</Label>
          <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name} · LKR {service.price}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quantity</Label>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Discount (LKR)</Label>
            <Input value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              const created = await api<{ id: string }>('/clinic/invoices', {
                method: 'POST',
                json: {
                  patientId,
                  appointmentId: appointmentId.trim() || undefined,
                  items: [{ serviceId, quantity: Number(quantity), discount }],
                },
              });
              navigate(`/billing/invoices/${created.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Invoice was not created');
            }
          }}
        >
          Save draft
        </Button>
      </CardContent>
    </Card>
  );
}
