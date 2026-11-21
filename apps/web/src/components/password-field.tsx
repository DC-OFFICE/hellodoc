import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordField({
  label,
  error,
  ...props
}: React.ComponentProps<'input'> & { label: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <Label htmlFor={props.id}>{label}</Label>
      <div className="relative">
        <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
