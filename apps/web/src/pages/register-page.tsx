import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BrandHeader } from '@/components/brand-header';
import { PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { notify } from '@/lib/notify';
import { isSriLankanMobile, SRI_LANKA_MOBILE_HINT, SRI_LANKA_MOBILE_MESSAGE } from '@/lib/phone';

const schema = z
  .object({
    clinicName: z.string().trim().min(2).max(120),
    ownerName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    mobile: z.string().trim().refine(isSriLankanMobile, SRI_LANKA_MOBILE_MESSAGE),
    address: z.string().trim().min(5).max(300),
    password: z
      .string()
      .min(10)
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[0-9]/, 'Include a number')
      .regex(/[^A-Za-z0-9]/, 'Include a special character'),
    confirmPassword: z.string().min(10),
    acceptTerms: z.literal(true, { error: 'You must accept the terms' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clinicName: '',
      ownerName: '',
      email: '',
      mobile: '',
      address: '',
      password: '',
      confirmPassword: '',
      acceptTerms: undefined as unknown as true,
    },
  });

  const onSubmit = form.handleSubmit(
    async (values) => {
      setServerError(null);
      try {
        await api('/clinic-registrations', { method: 'POST', json: values });
        setDone(true);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Registration failed';
        setServerError(message);
        if (!(error instanceof ApiError)) notify.error(message);
      }
    },
    (errors) => notify.formErrors(errors),
  );

  return (
    <div className="min-h-screen">
      <BrandHeader
        right={
          <Link to="/login">
            <Button variant="outline" type="button">Clinic login</Button>
          </Link>
        }
      />
      <main className="mx-auto max-w-2xl px-6 py-10 animate-rise">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold text-foreground">Register your dispensary</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Submissions require DartCodes administrator approval before a clinic schema is created.
            </p>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                Registration received. If the details are valid, a DartCodes administrator will review your request.
                You will not be able to sign in until approval and provisioning complete.
              </div>
            ) : (
              <form className="space-y-4" onSubmit={onSubmit} noValidate>
                <div>
                  <Label htmlFor="clinicName">Clinic / dispensary name</Label>
                  <Input id="clinicName" {...form.register('clinicName')} />
                  <p className="mt-1 text-xs text-red-700">{form.formState.errors.clinicName?.message}</p>
                </div>
                <div>
                  <Label htmlFor="ownerName">Owner / manager full name</Label>
                  <Input id="ownerName" {...form.register('ownerName')} />
                  <p className="mt-1 text-xs text-red-700">{form.formState.errors.ownerName?.message}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
                    <p className="mt-1 text-xs text-red-700">{form.formState.errors.email?.message}</p>
                  </div>
                  <div>
                    <Label htmlFor="mobile">Mobile number</Label>
                    <Input
                      id="mobile"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0771234567"
                      aria-invalid={Boolean(form.formState.errors.mobile)}
                      {...form.register('mobile')}
                    />
                    {form.formState.errors.mobile ? (
                      <p className="mt-1 text-xs text-red-700">{form.formState.errors.mobile.message}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{SRI_LANKA_MOBILE_HINT}</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="address">Clinic address</Label>
                  <Input id="address" {...form.register('address')} />
                  <p className="mt-1 text-xs text-red-700">{form.formState.errors.address?.message}</p>
                </div>
                <PasswordField
                  id="password"
                  label="Password"
                  autoComplete="new-password"
                  error={form.formState.errors.password?.message}
                  {...form.register('password')}
                />
                <PasswordField
                  id="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  error={form.formState.errors.confirmPassword?.message}
                  {...form.register('confirmPassword')}
                />
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" className="mt-1" {...form.register('acceptTerms')} />
                  <span>I accept the HelloDoc terms and privacy notice for clinic registration.</span>
                </label>
                <p className="text-xs text-red-700">{form.formState.errors.acceptTerms?.message}</p>
                {serverError ? <p className="text-sm text-red-700">{serverError}</p> : null}
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Submitting…' : 'Submit registration'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
