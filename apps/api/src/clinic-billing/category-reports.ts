import type { PoolClient } from 'pg';
import { formatCents, parseMoneyToCents } from '../common/money.js';

export const REPORT_CATEGORIES = ['invoices', 'appointments', 'doctors', 'patients'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Categories that expose patient visit data are limited to clinic managers. */
export const MANAGER_ONLY_CATEGORIES: readonly ReportCategory[] = ['appointments', 'doctors', 'patients'];

/** Hard cap so a very wide date range cannot produce an unbounded export. */
const MAX_ROWS = 5000;
const TZ = 'Asia/Colombo';

export type ReportColumn = { key: string; label: string; align?: 'left' | 'right' };
export type ReportRow = Record<string, string | number | null>;
export type CategoryReport = {
  category: ReportCategory;
  title: string;
  from: string;
  to: string;
  timezone: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: Array<{ label: string; value: string }>;
  truncated: boolean;
};

function sumMoney(rows: ReportRow[], key: string): string {
  let total = 0n;
  for (const row of rows) total += parseMoneyToCents(String(row[key] ?? '0'));
  return formatCents(total);
}

function count(rows: ReportRow[], predicate: (row: ReportRow) => boolean): string {
  return String(rows.filter(predicate).length);
}

function limitRows(rows: ReportRow[]) {
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

export async function buildCategoryReport(
  client: PoolClient,
  schema: string,
  category: ReportCategory,
  from: string,
  to: string,
): Promise<CategoryReport> {
  const base = { category, from, to, timezone: TZ };

  if (category === 'invoices') {
    const result = await client.query<ReportRow>(
      `SELECT COALESCE(i.invoice_number, 'DRAFT') AS invoice_number,
              to_char((COALESCE(i.issued_at, i.created_at) AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS date,
              p.patient_number,
              p.full_name AS patient_name,
              i.status,
              i.invoice_total::numeric(14,2)::text AS total,
              (COALESCE(pay.amount, 0) - COALESCE(ref.amount, 0))::numeric(14,2)::text AS paid,
              COALESCE(cn.amount, 0)::numeric(14,2)::text AS credits,
              (CASE WHEN i.status = 'ISSUED'
                    THEN GREATEST(i.invoice_total - COALESCE(cn.amount, 0)
                                  - (COALESCE(pay.amount, 0) - COALESCE(ref.amount, 0)), 0)
                    ELSE 0 END)::numeric(14,2)::text AS balance
       FROM ${schema}.invoices i
       JOIN ${schema}.patients p ON p.id = i.patient_id
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS amount FROM ${schema}.payments WHERE invoice_id = i.id
       ) pay ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(r.amount) AS amount
         FROM ${schema}.payment_refunds r
         JOIN ${schema}.payments rp ON rp.id = r.payment_id
         WHERE rp.invoice_id = i.id
       ) ref ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS amount FROM ${schema}.invoice_credit_notes WHERE invoice_id = i.id
       ) cn ON TRUE
       WHERE (COALESCE(i.issued_at, i.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
       ORDER BY COALESCE(i.issued_at, i.created_at) DESC
       LIMIT ${MAX_ROWS + 1}`,
      [from, to],
    );
    const { rows, truncated } = limitRows(result.rows);
    const issued = rows.filter((r) => r.status === 'ISSUED');
    return {
      ...base,
      title: 'Invoice report',
      columns: [
        { key: 'invoice_number', label: 'Invoice' },
        { key: 'date', label: 'Date' },
        { key: 'patient_number', label: 'Patient ID' },
        { key: 'patient_name', label: 'Patient' },
        { key: 'status', label: 'Status' },
        { key: 'total', label: 'Total (LKR)', align: 'right' },
        { key: 'paid', label: 'Paid (LKR)', align: 'right' },
        { key: 'credits', label: 'Credits (LKR)', align: 'right' },
        { key: 'balance', label: 'Balance (LKR)', align: 'right' },
      ],
      rows,
      summary: [
        { label: 'Invoices', value: String(rows.length) },
        { label: 'Issued', value: String(issued.length) },
        { label: 'Drafts', value: count(rows, (r) => r.status === 'DRAFT') },
        { label: 'Voided', value: count(rows, (r) => r.status === 'VOIDED') },
        { label: 'Issued total (LKR)', value: sumMoney(issued, 'total') },
        { label: 'Paid (LKR)', value: sumMoney(issued, 'paid') },
        { label: 'Outstanding (LKR)', value: sumMoney(issued, 'balance') },
      ],
      truncated,
    };
  }

  if (category === 'appointments') {
    const result = await client.query<ReportRow>(
      `SELECT a.booking_reference,
              to_char(s.local_date, 'YYYY-MM-DD') AS date,
              to_char(s.start_at AT TIME ZONE s.timezone, 'HH12:MI AM') || ' – ' ||
                to_char(s.end_at AT TIME ZONE s.timezone, 'HH12:MI AM') AS time,
              d.display_name AS doctor,
              p.patient_number,
              p.full_name AS patient_name,
              a.queue_number,
              a.booking_source,
              CASE WHEN a.status = 'CONFIRMED' AND q.checked_in_at IS NOT NULL THEN 'CHECKED IN'
                   ELSE a.status END AS status,
              COALESCE(q.state, '') AS queue_state
       FROM ${schema}.appointments a
       JOIN ${schema}.consultation_sessions s ON s.id = a.session_id
       JOIN ${schema}.doctors d ON d.id = s.doctor_id
       JOIN ${schema}.patients p ON p.id = a.patient_id
       LEFT JOIN ${schema}.queue_entries q ON q.appointment_id = a.id
       WHERE s.local_date BETWEEN $1::date AND $2::date
       ORDER BY s.local_date ASC, s.start_at ASC, a.queue_number ASC
       LIMIT ${MAX_ROWS + 1}`,
      [from, to],
    );
    const { rows, truncated } = limitRows(result.rows);
    return {
      ...base,
      title: 'Appointment details report',
      columns: [
        { key: 'booking_reference', label: 'Reference' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Session time' },
        { key: 'doctor', label: 'Doctor' },
        { key: 'patient_number', label: 'Patient ID' },
        { key: 'patient_name', label: 'Patient' },
        { key: 'queue_number', label: 'Queue #', align: 'right' },
        { key: 'booking_source', label: 'Source' },
        { key: 'status', label: 'Status' },
        { key: 'queue_state', label: 'Queue state' },
      ],
      rows,
      summary: [
        { label: 'Appointments', value: String(rows.length) },
        { label: 'Confirmed', value: count(rows, (r) => r.status === 'CONFIRMED') },
        { label: 'Checked in', value: count(rows, (r) => r.status === 'CHECKED IN') },
        { label: 'Completed consultations', value: count(rows, (r) => r.queue_state === 'COMPLETED') },
        { label: 'Cancelled', value: count(rows, (r) => r.status === 'CANCELLED') },
        { label: 'Rescheduled', value: count(rows, (r) => r.status === 'RESCHEDULED') },
      ],
      truncated,
    };
  }

  if (category === 'doctors') {
    const result = await client.query<ReportRow>(
      `SELECT d.display_name AS doctor,
              COALESCE(d.registration_number, '') AS registration_number,
              COALESCE(d.specialization_name, d.specialization, '') AS specialization,
              COUNT(DISTINCT s.id) FILTER (WHERE s.status <> 'CANCELLED')::int AS sessions,
              COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'CANCELLED')::int AS cancelled_sessions,
              COUNT(a.id) FILTER (WHERE a.status = 'CONFIRMED')::int AS appointments,
              COUNT(a.id) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled_appointments,
              COUNT(q.id) FILTER (WHERE q.state = 'COMPLETED')::int AS completed,
              COALESCE(SUM(inv.amount), 0)::numeric(14,2)::text AS invoiced
       FROM ${schema}.doctors d
       LEFT JOIN ${schema}.consultation_sessions s
         ON s.doctor_id = d.id AND s.local_date BETWEEN $1::date AND $2::date
       LEFT JOIN ${schema}.appointments a ON a.session_id = s.id
       LEFT JOIN ${schema}.queue_entries q ON q.appointment_id = a.id
       LEFT JOIN LATERAL (
         SELECT SUM(invoice_total) AS amount FROM ${schema}.invoices
         WHERE appointment_id = a.id AND status = 'ISSUED'
       ) inv ON TRUE
       GROUP BY d.id
       HAVING d.status = 'ACTIVE' OR COUNT(s.id) > 0
       ORDER BY d.display_name ASC
       LIMIT ${MAX_ROWS + 1}`,
      [from, to],
    );
    const { rows, truncated } = limitRows(result.rows);
    const total = (key: string) => String(rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0));
    return {
      ...base,
      title: 'Doctor report',
      columns: [
        { key: 'doctor', label: 'Doctor' },
        { key: 'registration_number', label: 'Registration' },
        { key: 'specialization', label: 'Specialization' },
        { key: 'sessions', label: 'Sessions', align: 'right' },
        { key: 'cancelled_sessions', label: 'Cancelled sessions', align: 'right' },
        { key: 'appointments', label: 'Appointments', align: 'right' },
        { key: 'cancelled_appointments', label: 'Cancelled appts', align: 'right' },
        { key: 'completed', label: 'Completed', align: 'right' },
        { key: 'invoiced', label: 'Invoiced (LKR)', align: 'right' },
      ],
      rows,
      summary: [
        { label: 'Doctors', value: String(rows.length) },
        { label: 'Sessions', value: total('sessions') },
        { label: 'Appointments', value: total('appointments') },
        { label: 'Completed consultations', value: total('completed') },
        { label: 'Invoiced (LKR)', value: sumMoney(rows, 'invoiced') },
      ],
      truncated,
    };
  }

  // patients: anyone with an appointment in the range, or registered in the range
  const result = await client.query<ReportRow>(
    `SELECT p.patient_number,
            p.full_name AS patient_name,
            COALESCE(p.sex, '') AS sex,
            COALESCE(
              CASE WHEN p.date_of_birth IS NOT NULL
                   THEN date_part('year', age(CURRENT_DATE, p.date_of_birth))::int
                   ELSE p.approximate_age_years END::text,
              '') AS age,
            COALESCE((
              SELECT c.display_value FROM ${schema}.patient_contacts c
              WHERE c.patient_id = p.id ORDER BY c.is_primary DESC LIMIT 1
            ), '') AS phone,
            to_char((p.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS registered,
            CASE WHEN (p.created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                 THEN 'Yes' ELSE 'No' END AS new_patient,
            v.visits::int AS appointments,
            COALESCE(v.last_visit, '') AS last_visit,
            COALESCE(inv.amount, 0)::numeric(14,2)::text AS invoiced
     FROM ${schema}.patients p
     JOIN LATERAL (
       SELECT COUNT(*) AS visits, to_char(MAX(s.local_date), 'YYYY-MM-DD') AS last_visit
       FROM ${schema}.appointments a
       JOIN ${schema}.consultation_sessions s ON s.id = a.session_id
       WHERE a.patient_id = p.id AND a.status = 'CONFIRMED'
         AND s.local_date BETWEEN $1::date AND $2::date
     ) v ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(invoice_total) AS amount FROM ${schema}.invoices
       WHERE patient_id = p.id AND status = 'ISSUED'
         AND (issued_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
     ) inv ON TRUE
     WHERE v.visits > 0 OR (p.created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
     ORDER BY p.patient_number ASC
     LIMIT ${MAX_ROWS + 1}`,
    [from, to],
  );
  const { rows, truncated } = limitRows(result.rows);
  return {
    ...base,
    title: 'Patient report',
    columns: [
      { key: 'patient_number', label: 'Patient ID' },
      { key: 'patient_name', label: 'Patient' },
      { key: 'sex', label: 'Sex' },
      { key: 'age', label: 'Age', align: 'right' },
      { key: 'phone', label: 'Phone' },
      { key: 'registered', label: 'Registered' },
      { key: 'new_patient', label: 'New in period' },
      { key: 'appointments', label: 'Appointments', align: 'right' },
      { key: 'last_visit', label: 'Last visit' },
      { key: 'invoiced', label: 'Invoiced (LKR)', align: 'right' },
    ],
    rows,
    summary: [
      { label: 'Patients', value: String(rows.length) },
      { label: 'New registrations', value: count(rows, (r) => r.new_patient === 'Yes') },
      {
        label: 'Appointments',
        value: String(rows.reduce((acc, r) => acc + Number(r.appointments ?? 0), 0)),
      },
      { label: 'Invoiced (LKR)', value: sumMoney(rows, 'invoiced') },
    ],
    truncated,
  };
}
