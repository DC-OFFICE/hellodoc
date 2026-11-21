import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  DollarSign,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DeleteServiceDialog,
  ServiceFormDialog,
  type ServiceRecord,
} from '@/components/service-form-dialog';
import { api, ApiError } from '@/lib/api';

export function ServicesPage() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter & Search state
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceRecord | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ items: ServiceRecord[] }>('/clinic/billing/services');
      setServices(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load clinic services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.active).length;
    const inactive = total - active;
    const activePrices = services
      .filter((s) => s.active)
      .map((s) => Number(s.price))
      .filter((p) => !Number.isNaN(p));
    const avgFee =
      activePrices.length > 0
        ? activePrices.reduce((sum, p) => sum + p, 0) / activePrices.length
        : 0;

    return { total, active, inactive, avgFee };
  }, [services]);

  // Filtered List
  const filtered = useMemo(() => {
    return services.filter((svc) => {
      if (tab === 'ACTIVE' && !svc.active) return false;
      if (tab === 'INACTIVE' && svc.active) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        svc.code.toLowerCase().includes(q) ||
        svc.name.toLowerCase().includes(q) ||
        (svc.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [services, tab, search]);

  async function handleToggleActive(service: ServiceRecord, e: React.MouseEvent) {
    e.stopPropagation();
    const nextActive = !service.active;
    try {
      await api(`/clinic/billing/services/${service.id}`, {
        method: 'PATCH',
        json: { active: nextActive },
      });
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, active: nextActive } : s)),
      );
      setNotice(
        `Service "${service.name}" (${service.code}) marked as ${nextActive ? 'Active' : 'Inactive'}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update service status');
    }
  }

  function handleEdit(service: ServiceRecord) {
    setSelectedService(service);
    setFormOpen(true);
  }

  function handleDelete(service: ServiceRecord) {
    setServiceToDelete(service);
    setDeleteOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Services & Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Manage consultation fees, dispensary charges, procedure rates, and billing catalog items.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedService(null);
            setFormOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Add Service
        </Button>
      </div>

      {notice && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <AlertDescription className="flex items-center justify-between">
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-xs font-semibold hover:underline"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Services
            </CardTitle>
            <Layers className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Catalog items registered</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Services
            </CardTitle>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {kpis.active}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.total > 0 ? `${Math.round((kpis.active / kpis.total) * 100)}%` : '0%'} available for cashier billing
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inactive / Archived
            </CardTitle>
            <Archive className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{kpis.inactive}</div>
            <p className="text-xs text-muted-foreground mt-1">Deactivated or seasonal services</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Service Fee
            </CardTitle>
            <DollarSign className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              LKR {kpis.avgFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across active standard services</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={(val) => setTab(val as typeof tab)}>
              <TabsList>
                <TabsTrigger value="ALL">All ({kpis.total})</TabsTrigger>
                <TabsTrigger value="ACTIVE">Active ({kpis.active})</TabsTrigger>
                <TabsTrigger value="INACTIVE">Inactive ({kpis.inactive})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Code</TableHead>
                <TableHead>Service Name & Description</TableHead>
                <TableHead className="w-[140px] text-right">Price (LKR)</TableHead>
                <TableHead className="w-[120px] text-center">Tax</TableHead>
                <TableHead className="w-[120px] text-center">Status</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    Loading billing services…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    {search ? 'No matching services found.' : 'No services registered yet. Click "Add Service" to start.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((service) => (
                  <TableRow key={service.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Badge tone="suspended" className="font-mono text-xs">
                        {service.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{service.name}</div>
                      {service.description ? (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {service.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      LKR {Number(service.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        {service.tax_classification}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Badge tone={service.active ? 'active' : 'suspended'}>
                          {service.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Switch
                          checked={service.active}
                          onCheckedChange={() => {}}
                          onClick={(e) => handleToggleActive(service, e)}
                          title={service.active ? 'Click to deactivate' : 'Click to activate'}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(service)}
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          title="Edit service details"
                        >
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(service)}
                          className="h-8 px-2 text-destructive hover:bg-destructive/10"
                          title="Delete or archive service"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={selectedService}
        onSuccess={() => {
          setNotice(
            selectedService
              ? `Service "${selectedService.name}" updated successfully.`
              : 'New billing service registered successfully.',
          );
          void loadServices();
        }}
      />

      {/* Delete / Archive Confirmation Dialog */}
      <DeleteServiceDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        service={serviceToDelete}
        onSuccess={(msg) => {
          setNotice(msg);
          void loadServices();
        }}
      />
    </div>
  );
}
