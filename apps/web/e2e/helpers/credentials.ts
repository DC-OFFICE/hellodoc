import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type E2ERole = {
  email: string;
  password: string;
  role: string;
};

export type E2EClinic = {
  clinicName: string;
  bookingSessionId: string;
  doctorSessionId: string;
  doctorId: string;
  doctorName: string;
  serviceId: string;
  seedPatientId: string;
  seedPatientNumber: string;
  seedAppointmentId: string;
  trackingPath: string;
  manager: E2ERole;
  doctor: E2ERole;
  cashier: E2ERole;
  receptionist: E2ERole;
};

export type E2ECredentials = {
  runId: string;
  marker: string;
  mfaRequired: boolean;
  webOrigin: string;
  apiBase: string;
  clinicA: E2EClinic;
  clinicB: E2EClinic;
};

export function loadCredentials(): E2ECredentials {
  const path = join(process.cwd(), 'e2e', '.auth', 'credentials.json');
  return JSON.parse(readFileSync(path, 'utf8')) as E2ECredentials;
}
