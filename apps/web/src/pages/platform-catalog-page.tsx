import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { api, ApiError } from '@/lib/api';

type CatalogItem = {
  id: string;
  name: string;
  nameNormalized: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
  kind: 'specializations' | 'qualifications';
  title: string;
  singular: string;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '' },
  });

  const load = useCallback(async () => {
    const data = await api<CatalogItem[]>(
      `/platform/${kind}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
    );
    setItems(data);
  }, [kind, q]);

  useEffect(() => {
    void load().catch(() => setError(`Failed to load ${title.toLowerCase()}`));
  }, [load, title]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">
          Global catalog used by all clinics when adding doctors. Deactivate instead of deleting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Add {singular.toLowerCase()}</h2>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={form.handleSubmit(async (values) => {
              setError(null);
              try {
                await api(`/platform/${kind}`, { method: 'POST', json: values });
                form.reset({ name: '' });
                await load();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Create failed');
              }
            })}
            noValidate
          >
            <div className="flex-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder={`e.g. ${singular}`} {...form.register('name')} />
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filter ${title.toLowerCase()}…`}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
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
                      <span className="font-medium text-slate-900">{item.name}</span>
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
                            variant="outline"
                            type="button"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
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
                  <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                    No {title.toLowerCase()} yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
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
