import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Building2, CheckCircle2, Database, HeartPulse, LayoutDashboard, LockKeyhole, Stethoscope } from 'lucide-react';

type ApiState = 'checking' | 'online' | 'offline';
const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

const modules = [
  { title: 'Platform administration', caption: 'Tenant registry, onboarding, plans & access', Icon: LayoutDashboard, state: 'Foundation planned' },
  { title: 'Dispensary workspace', caption: 'Clinic setup, patients, sessions & queue', Icon: Building2, state: 'Next development stage' },
  { title: 'Doctor workspace', caption: 'Consultations, history & prescriptions', Icon: Stethoscope, state: 'Later in MVP' },
];

export default function App() {
  const [api, setApi] = useState<ApiState>('checking');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/health`, { signal: controller.signal })
      .then((r) => setApi(r.ok ? 'online' : 'offline'))
      .catch((error: unknown) => { if ((error as { name?: string })?.name !== 'AbortError') setApi('offline'); });
    return () => controller.abort();
  }, []);
  return (
    <div className="min-h-screen bg-[#f6faf8]">
      <header className="border-b border-emerald-100/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><HeartPulse size={23} /></div>
            <div><div className="text-xl font-bold tracking-tight text-slate-900">HelloDoc<span className="text-teal-600">.</span></div><p className="text-xs text-slate-500">by DartCodes (Pvt) Ltd</p></div>
          </div>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">Developer foundation</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800"><CheckCircle2 size={15}/> Phase 0 · Project setup</div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">A calmer clinic day starts here.</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">Welcome to the HelloDoc SaaS foundation. The workspace below shows the planned applications and confirms that your local development API is reachable.</p>
        </div>
        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {modules.map(({title,caption,Icon,state}) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon size={21}/></div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-slate-600">{caption}</p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-teal-700">{state}<ArrowRight size={13}/></div>
            </article>
          ))}
        </section>
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Activity size={21}/></div>
              <div><h2 className="font-semibold text-slate-900">Local API connectivity</h2><p className="mt-1 break-all text-sm text-slate-500">{apiBase}/health</p></div>
            </div>
            <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${api==='online'?'bg-green-100 text-green-800':api==='offline'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-600'}`}><span className="h-2 w-2 rounded-full bg-current"/>{api==='online'?'API online':api==='offline'?'API not reachable':'Checking API'}</div>
          </div>
        </section>
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50 p-5"><Database className="mt-0.5 shrink-0 text-teal-700" size={20}/><div><h3 className="font-medium text-teal-950">PostgreSQL control plane</h3><p className="mt-1 text-sm leading-6 text-teal-900/80">Prisma platform schema and tenant registry models are scaffolded, not yet onboarded.</p></div></div>
          <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-5"><LockKeyhole className="mt-0.5 shrink-0 text-amber-700" size={20}/><div><h3 className="font-medium text-amber-950">Clinical access is gated</h3><p className="mt-1 text-sm leading-6 text-amber-900/80">Tenant authorization, patient data access, and production readiness require the next implementation milestones.</p></div></div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">HelloDoc · Internal development starter · Not for patient data</footer>
    </div>
  );
}
