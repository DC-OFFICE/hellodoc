import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type CatalogItem = { id: string; name: string };

export function CatalogCombobox({
  label,
  kind,
  value,
  selectedName,
  onChange,
  error,
}: {
  label: string;
  kind: 'specializations' | 'qualifications';
  value?: string;
  selectedName?: string;
  onChange: (id: string, name: string) => void;
  error?: string;
}) {
  const [q, setQ] = useState(selectedName ?? '');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selectedName) setQ(selectedName);
  }, [selectedName]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      api<CatalogItem[]>(`/clinic/catalog/${kind}?q=${encodeURIComponent(q.trim())}`)
        .then((data) => {
          if (!cancelled) setItems(data);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [kind, q]);

  return (
    <div className="relative">
      <Label>{label}</Label>
      <Input
        value={q}
        placeholder={`Search ${label.toLowerCase()}…`}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {value ? (
        <p className="mt-1 text-xs text-teal-700">Selected: {selectedName || value}</p>
      ) : null}
      {open && items.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow-md">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(item.id, item.name);
                setQ(item.name);
                setOpen(false);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
