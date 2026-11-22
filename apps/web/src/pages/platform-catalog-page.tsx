import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { api, ApiError } from '@/lib/api';
import { notify } from '@/lib/notify';
type CatalogItem = {
  id: string;
  name: string;
  nameNormalized: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CatalogPage = {
  items: CatalogItem[];
  total: number;
  limit: number;
  offset: number;
};

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

type CreateValues = z.infer<typeof createSchema>;

export function PlatformCatalogPage({
  kind,
  title,
  singular,
}: {
  kind: 'specializations' | 'qualifications' | 'relationships';
  title: string;
  singular: string;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState({ q: '', offset: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = q.trim();
      setQuery((current) => (current.q === next ? current : { q: next, offset: 0 }));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(query.offset),
    });
    if (query.q) params.set('q', query.q);
    const data = await api<CatalogPage>(`/platform/${kind}?${params}`);
    if (data.items.length === 0 && query.offset > 0) {
      setQuery((current) => ({ ...current, offset: Math.max(0, current.offset - limit) }));
      return;
    }
    setItems(data.items);
    setTotal(data.total);
    setError(null);
  }, [kind, query, limit]);

  useEffect(() => {
    void load().catch(() => setError(`Failed to load ${title.toLowerCase()}`));
  }, [load, title]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Global catalog used by all clinics when adding doctors. Deactivate instead of deleting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manage {title.toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={form.handleSubmit(
              async (values) => {
                setError(null);
                try {
                  await api(`/platform/${kind}`, { method: 'POST', json: values });
                  form.reset({ name: '' });
                  if (query.offset !== 0) setQuery((current) => ({ ...current, offset: 0 }));
                  else await load();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Create failed');
                }
              },
              (errors) => notify.formErrors(errors),
            )}
            noValidate
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder={`e.g. ${singular}`} {...form.register('name')} />
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </form>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Filter ${title.toLowerCase()}…`}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="overflow-hidden">
        <CardContent className="px-0 pt-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {editingId === item.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="max-w-xs"
                      />
                    ) : (
                      <span className="font-medium text-foreground">{item.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone={item.active ? 'active' : 'suspended'}>
                      {item.active ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {editingId === item.id ? (
                        <>
                          <Button
                            size="sm"
                            type="button"
                            disabled={busyId === item.id}
                            onClick={async () => {
                              setBusyId(item.id);
                              setError(null);
                              try {
                                await api(`/platform/${kind}/${item.id}`, {
                                  method: 'PATCH',
                                  json: { name: editName },
                                });
                                setEditingId(null);
                                await load();
                              } catch (err) {
                                setError(err instanceof ApiError ? err.message : 'Update failed');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                        >
                          Rename
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={item.active ? 'destructive' : 'secondary'}
                        type="button"
                        disabled={busyId === item.id}
                        onClick={async () => {
                          setBusyId(item.id);
                          setError(null);
                          try {
                            await api(`/platform/${kind}/${item.id}`, {
                              method: 'PATCH',
                              json: { active: !item.active },
                            });
                            await load();
                          } catch (err) {
                            setError(err instanceof ApiError ? err.message : 'Update failed');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {item.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No {title.toLowerCase()} yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="border-t border-border/70 bg-muted/20 px-4 py-3">
            <TablePagination
              total={total}
              limit={limit}
              offset={query.offset}
              pageSizeOptions={[10, 20, 30, 50]}
              onPageChange={(newOffset) =>
                setQuery((current) => ({ ...current, offset: newOffset }))
              }
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setQuery((current) => ({ ...current, offset: 0 }));
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PlatformSpecializationsPage() {
  return (
    <PlatformCatalogPage kind="specializations" title="Specializations" singular="Specialization" />
  );
}

export function PlatformQualificationsPage() {
  return (
    <PlatformCatalogPage kind="qualifications" title="Qualifications" singular="Qualification" />
  );
}

export function PlatformRelationshipsPage() {
  return (
    <PlatformCatalogPage kind="relationships" title="Relationships" singular="Relationship" />
  );
}
