import { HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandHeader({
  right,
  subtitle = 'by DartCodes (Pvt) Ltd',
}: {
  right?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="border-b border-teal-100/80 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
            <HeartPulse size={22} />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-slate-900">
              HelloDoc<span className="text-teal-600">.</span>
            </div>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </Link>
        {right}
      </div>
    </header>
  );
}
