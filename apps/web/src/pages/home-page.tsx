import { Link } from 'react-router-dom';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <BrandHeader
        right={
          <div className="flex flex-wrap gap-2">
            <Link to="/login">
              <Button variant="outline" type="button">Clinic login</Button>
            </Link>
            <Link to="/register">
              <Button type="button">Register clinic</Button>
            </Link>
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-6 py-14 animate-rise">
        <p className="mb-3 text-sm font-semibold tracking-wide text-teal-700 uppercase">HelloDoc SaaS</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Clinic registration and secure tenant foundation
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Register your dispensary, wait for DartCodes approval, then access your isolated clinic workspace.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/register"><Button size="lg" type="button">Register a dispensary</Button></Link>
          <Link to="/login"><Button size="lg" variant="secondary" type="button">Clinic login</Button></Link>
          <Link to="/platform-admin"><Button size="lg" variant="outline" type="button">Platform admin</Button></Link>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['1. Register', 'Submit clinic details. Access is not granted until approval.'],
            ['2. Approval', 'A DartCodes administrator provisions a dedicated PostgreSQL schema.'],
            ['3. Dashboard', 'Approved managers sign in and see their clinic name only.'],
          ].map(([title, body]) => (
            <Card key={title}>
              <CardContent>
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
