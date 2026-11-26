import { Injectable } from '@nestjs/common';
import type { ClinicContext } from '../clinic-context/clinic-context.service.js';
import { formatCents, parseMoneyToCents } from '../common/money.js';
import { TenantSqlClient } from '../tenant-provisioning/tenant-sql.client.js';
import type { DashboardMetricsQueryDto } from './dto/dashboard-metrics-query.dto.js';

export type DashboardKpis = {
  totalAppointments: number;
  completedAppointments: number;
  waitingAppointments: number;
  inConsultationAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalInvoiced: string;
  totalCollected: string;
  cashCollected: string;
  cardCollected: string;
  bankCollected: string;
  totalRefunded: string;
  outstandingBalance: string;
  newPatientsCount: number;
  returningPatientsCount: number;
  capacityUtilizationPct: number;
  averageWaitMinutes: number;
  deltas: {
    appointmentsPct: number | null;
    revenuePct: number | null;
    collectedPct: number | null;
  };
};

export type DashboardTrendPoint = {
  date: string;
  booked: number;
  completed: number;
  cancelled: number;
  revenue: number;
};

export type DoctorProductivityItem = {
  doctorId: string;
  doctorName: string;
  specialization?: string | null;
  sessionCount: number;
  patientCount: number;
  completedCount: number;
  revenue: number;
};

export type HourlyArrivalItem = {
  hour: number;
  label: string;
  count: number;
};

export type DashboardSessionItem = {
  id: string;
  doctorId: string;
  doctorName: string;
  localDate: string;
  timeRange: string;
  capacity: number;
  bookedCount: number;
  completedCount: number;
  status: string;
};

export type DashboardMetricsResponse = {
  timezone: string;
  from: string;
  to: string;
  preset: string;
  kpis: DashboardKpis;
  volumeTrends: DashboardTrendPoint[];
  doctorWorkload: DoctorProductivityItem[];
  hourlyDistribution: HourlyArrivalItem[];
  recentSessions: DashboardSessionItem[];
};

@Injectable()
export class ClinicDashboardService {
  constructor(private readonly sql: TenantSqlClient) {}

  async getMetrics(ctx: ClinicContext, query: DashboardMetricsQueryDto): Promise<DashboardMetricsResponse> {
    const tz = 'Asia/Colombo';
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

    let from = query.from;
    let to = query.to;
    const preset = query.preset ?? (from && to ? 'custom' : 'today');

    if (preset === 'today') {
      from = todayStr;
      to = todayStr;
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(y);
      from = yStr;
      to = yStr;
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      from = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(past);
      to = todayStr;
    } else if (preset === 'week') {
      // Calendar week starting Monday (Asia/Colombo)
      const today = new Date(`${todayStr}T00:00:00Z`);
      const daysSinceMonday = (today.getUTCDay() + 6) % 7;
      from = new Date(today.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      to = todayStr;
    } else if (preset === 'month') {
      from = `${todayStr.slice(0, 7)}-01`;
      to = todayStr;
    } else {
      from = from ?? todayStr;
      to = to ?? from;
    }

    if (from > to) {
      const temp = from;
      from = to;
      to = temp;
    }

    const doctorId = query.doctorId && query.doctorId !== 'all' ? query.doctorId : null;
    const sessionId = query.sessionId && query.sessionId !== 'all' ? query.sessionId : null;

    // Calculate previous period duration for delta comparison
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    const durationMs = Math.max(toDate.getTime() - fromDate.getTime(), 0) + 24 * 60 * 60 * 1000;
    const prevToDate = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
    const prevFromDate = new Date(prevToDate.getTime() - durationMs + 24 * 60 * 60 * 1000);
    const prevFrom = prevFromDate.toISOString().slice(0, 10);
    const prevTo = prevToDate.toISOString().slice(0, 10);

    return this.sql.withClient(async (client) => {
      // 1. Appointments & Queue KPIs
      const apptRes = await client.query(
        `SELECT
           COUNT(a.id)::int AS total,
           COUNT(a.id) FILTER (WHERE q.state = 'COMPLETED')::int AS completed,
           COUNT(a.id) FILTER (WHERE q.state = 'IN_SERVICE')::int AS in_consultation,
           COUNT(a.id) FILTER (WHERE q.state IN ('WAITING', 'CALLED'))::int AS waiting,
           COUNT(a.id) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled,
           COUNT(a.id) FILTER (WHERE q.state = 'NO_SHOW')::int AS no_show,
           COUNT(DISTINCT a.patient_id)::int AS unique_patients,
           COALESCE(AVG(EXTRACT(EPOCH FROM (q.service_started_at - q.checked_in_at)) / 60)
             FILTER (WHERE q.state = 'COMPLETED' AND q.checked_in_at IS NOT NULL AND q.service_started_at >= q.checked_in_at), 0)::float AS avg_wait_minutes
         FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         WHERE s.local_date BETWEEN $1::date AND $2::date
           AND ($3::uuid IS NULL OR s.doctor_id = $3::uuid)
           AND ($4::uuid IS NULL OR a.session_id = $4::uuid)`,
        [from, to, doctorId, sessionId],
      );

      // Previous period appointments for delta
      const prevApptRes = await client.query(
        `SELECT
           COUNT(a.id)::int AS total
         FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         WHERE s.local_date BETWEEN $1::date AND $2::date
           AND ($3::uuid IS NULL OR s.doctor_id = $3::uuid)
           AND ($4::uuid IS NULL OR a.session_id = $4::uuid)`,
        [prevFrom, prevTo, doctorId, sessionId],
      );

      // 2. Financial Collections KPIs
      const finRes = await client.query(
        `SELECT
           COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'CASH'), 0)::text AS cash,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'CARD_EXTERNAL'), 0)::text AS card,
           COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'BANK_TRANSFER'), 0)::text AS bank,
           COALESCE(SUM(p.amount), 0)::text AS collected
         FROM ${ctx.quotedSchema}.payments p
         WHERE (p.recorded_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, from, to],
      );

      const issuedRes = await client.query(
        `SELECT
           COALESCE(SUM(i.invoice_total), 0)::text AS invoiced
         FROM ${ctx.quotedSchema}.invoices i
         WHERE i.status = 'ISSUED'
           AND (i.issued_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, from, to],
      );

      const refundRes = await client.query(
        `SELECT
           COALESCE(SUM(r.amount), 0)::text AS refunded
         FROM ${ctx.quotedSchema}.payment_refunds r
         WHERE (r.recorded_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, from, to],
      );

      const outstandingRes = await client.query(
        `SELECT COALESCE(SUM(bal), 0)::text AS outstanding FROM (
           SELECT (
             i.invoice_total
             - COALESCE((SELECT SUM(c.amount) FROM ${ctx.quotedSchema}.invoice_credit_notes c WHERE c.invoice_id = i.id), 0)
             - (
               COALESCE((SELECT SUM(p.amount) FROM ${ctx.quotedSchema}.payments p WHERE p.invoice_id = i.id), 0)
               - COALESCE((SELECT SUM(r.amount) FROM ${ctx.quotedSchema}.payment_refunds r
                            JOIN ${ctx.quotedSchema}.payments p ON p.id = r.payment_id
                            WHERE p.invoice_id = i.id), 0)
             )
           ) AS bal
           FROM ${ctx.quotedSchema}.invoices i
           WHERE i.status = 'ISSUED'
         ) s WHERE bal > 0`,
      );

      // Previous period financial collections for delta
      const prevFinRes = await client.query(
        `SELECT
           COALESCE(SUM(p.amount), 0)::text AS collected
         FROM ${ctx.quotedSchema}.payments p
         WHERE (p.recorded_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, prevFrom, prevTo],
      );

      const prevIssuedRes = await client.query(
        `SELECT
           COALESCE(SUM(i.invoice_total), 0)::text AS invoiced
         FROM ${ctx.quotedSchema}.invoices i
         WHERE i.status = 'ISSUED'
           AND (i.issued_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, prevFrom, prevTo],
      );

      // 3. New Patients vs Returning Patients
      const patRes = await client.query(
        `SELECT
           COUNT(p.id)::int AS new_patients
         FROM ${ctx.quotedSchema}.patients p
         WHERE (p.created_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date`,
        [tz, from, to],
      );

      // 4. Session Capacity Utilization
      const capRes = await client.query(
        `SELECT
           COALESCE(SUM(s.capacity), 0)::int AS total_capacity
         FROM ${ctx.quotedSchema}.consultation_sessions s
         WHERE s.local_date BETWEEN $1::date AND $2::date
           AND s.status != 'CANCELLED'
           AND ($3::uuid IS NULL OR s.doctor_id = $3::uuid)
           AND ($4::uuid IS NULL OR s.id = $4::uuid)`,
        [from, to, doctorId, sessionId],
      );

      // 5. Volume Trends Series (Daily Buckets)
      const trendsRes = await client.query(
        `WITH date_series AS (
           SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS d
         ),
         appt_stats AS (
           SELECT
             s.local_date AS d,
             COUNT(a.id)::int AS booked,
             COUNT(a.id) FILTER (WHERE q.state = 'COMPLETED')::int AS completed,
             COUNT(a.id) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled
           FROM ${ctx.quotedSchema}.appointments a
           JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
           LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
           WHERE s.local_date BETWEEN $1::date AND $2::date
             AND ($3::uuid IS NULL OR s.doctor_id = $3::uuid)
             AND ($4::uuid IS NULL OR a.session_id = $4::uuid)
           GROUP BY s.local_date
         ),
         pay_stats AS (
           SELECT
             (p.recorded_at AT TIME ZONE $5)::date AS d,
             COALESCE(SUM(p.amount), 0)::float AS rev
           FROM ${ctx.quotedSchema}.payments p
           WHERE (p.recorded_at AT TIME ZONE $5)::date BETWEEN $1::date AND $2::date
           GROUP BY (p.recorded_at AT TIME ZONE $5)::date
         )
         SELECT
           ds.d::text AS date,
           COALESCE(ast.booked, 0)::int AS booked,
           COALESCE(ast.completed, 0)::int AS completed,
           COALESCE(ast.cancelled, 0)::int AS cancelled,
           COALESCE(pst.rev, 0)::float AS revenue
         FROM date_series ds
         LEFT JOIN appt_stats ast ON ast.d = ds.d
         LEFT JOIN pay_stats pst ON pst.d = ds.d
         ORDER BY ds.d ASC`,
        [from, to, doctorId, sessionId, tz],
      );

      // 6. Doctor Workload / Productivity Ranking
      const docRes = await client.query(
        `SELECT
           d.id AS "doctorId",
           d.display_name AS "doctorName",
           d.specialization,
           COUNT(DISTINCT s.id)::int AS "sessionCount",
           COUNT(a.id)::int AS "patientCount",
           COUNT(a.id) FILTER (WHERE q.state = 'COMPLETED')::int AS "completedCount"
         FROM ${ctx.quotedSchema}.doctors d
         LEFT JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.doctor_id = d.id AND s.local_date BETWEEN $1::date AND $2::date AND s.status != 'CANCELLED'
         LEFT JOIN ${ctx.quotedSchema}.appointments a ON a.session_id = s.id AND a.status != 'CANCELLED'
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         WHERE d.status = 'ACTIVE'
           AND ($3::uuid IS NULL OR d.id = $3::uuid)
         GROUP BY d.id, d.display_name, d.specialization
         ORDER BY "completedCount" DESC, "patientCount" DESC, d.display_name ASC`,
        [from, to, doctorId],
      );

      // 7. Hourly Arrival Distribution (Peak Clinic Rush)
      const hourlyRes = await client.query(
        `SELECT
           EXTRACT(HOUR FROM (COALESCE(q.checked_in_at, a.created_at) AT TIME ZONE $5))::int AS hr,
           COUNT(a.id)::int AS count
         FROM ${ctx.quotedSchema}.appointments a
         JOIN ${ctx.quotedSchema}.consultation_sessions s ON s.id = a.session_id
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         WHERE s.local_date BETWEEN $1::date AND $2::date
           AND ($3::uuid IS NULL OR s.doctor_id = $3::uuid)
           AND ($4::uuid IS NULL OR a.session_id = $4::uuid)
         GROUP BY hr
         ORDER BY hr ASC`,
        [from, to, doctorId, sessionId, tz],
      );

      // 8. Recent / Today's Active Operational Sessions
      const sessionsRes = await client.query(
        `SELECT
           s.id,
           s.doctor_id AS "doctorId",
           d.display_name AS "doctorName",
           s.local_date::text AS "localDate",
           to_char(s.start_at AT TIME ZONE $3, 'HH12:MI AM') || ' - ' || to_char(s.end_at AT TIME ZONE $3, 'HH12:MI AM') AS "timeRange",
           s.capacity,
           s.status,
           COUNT(a.id) FILTER (WHERE a.status != 'CANCELLED')::int AS "bookedCount",
           COUNT(a.id) FILTER (WHERE q.state = 'COMPLETED')::int AS "completedCount"
         FROM ${ctx.quotedSchema}.consultation_sessions s
         JOIN ${ctx.quotedSchema}.doctors d ON d.id = s.doctor_id
         LEFT JOIN ${ctx.quotedSchema}.appointments a ON a.session_id = s.id
         LEFT JOIN ${ctx.quotedSchema}.queue_entries q ON q.appointment_id = a.id
         WHERE s.local_date BETWEEN $1::date AND $2::date
           AND ($4::uuid IS NULL OR s.doctor_id = $4::uuid)
           AND ($5::uuid IS NULL OR s.id = $5::uuid)
         GROUP BY s.id, s.doctor_id, d.display_name, s.local_date, s.start_at, s.end_at, s.capacity, s.status
         ORDER BY s.local_date DESC, s.start_at ASC
         LIMIT 6`,
        [from, to, tz, doctorId, sessionId],
      );

      // Calculations and Formatting
      const apptData = apptRes.rows[0];
      const finData = finRes.rows[0];
      const issuedData = issuedRes.rows[0];
      const refundData = refundRes.rows[0];
      const outstandingData = outstandingRes.rows[0];
      const patData = patRes.rows[0];
      const capData = capRes.rows[0];

      const money = (val: string | null | undefined) => formatCents(parseMoneyToCents(val ?? '0.00'));
      const toCentsNumber = (val: string | null | undefined) => Number(parseMoneyToCents(val ?? '0.00')) / 100;

      const totalAppts = apptData.total;
      const prevTotalAppts = prevApptRes.rows[0]?.total ?? 0;
      const apptsDelta =
        prevTotalAppts > 0
          ? Math.round(((totalAppts - prevTotalAppts) / prevTotalAppts) * 100)
          : null;

      const curRevenueCents = toCentsNumber(issuedData.invoiced);
      const prevRevenueCents = toCentsNumber(prevIssuedRes.rows[0]?.invoiced);
      const revenueDelta =
        prevRevenueCents > 0
          ? Math.round(((curRevenueCents - prevRevenueCents) / prevRevenueCents) * 100)
          : null;

      const curCollectedCents = toCentsNumber(finData.collected);
      const prevCollectedCents = toCentsNumber(prevFinRes.rows[0]?.collected);
      const collectedDelta =
        prevCollectedCents > 0
          ? Math.round(((curCollectedCents - prevCollectedCents) / prevCollectedCents) * 100)
          : null;

      const totalCap = capData.total_capacity;
      const utilization = totalCap > 0 ? Math.min(100, Math.round((totalAppts / totalCap) * 100)) : 0;
      const newPatients = patData.new_patients;
      const uniquePatients = apptData.unique_patients;
      const returningPatients = Math.max(0, uniquePatients - newPatients);

      // Build hourly slots 8:00 AM to 9:00 PM (8 to 21)
      const hourlyMap = new Map<number, number>();
      for (const r of hourlyRes.rows) {
        hourlyMap.set(r.hr, r.count);
      }
      const hourlyDistribution: HourlyArrivalItem[] = [];
      for (let h = 8; h <= 21; h++) {
        const period = h < 12 ? 'AM' : 'PM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        hourlyDistribution.push({
          hour: h,
          label: `${displayH} ${period}`,
          count: hourlyMap.get(h) ?? 0,
        });
      }

      const volumeTrends: DashboardTrendPoint[] = trendsRes.rows.map((row) => ({
        date: row.date,
        booked: row.booked,
        completed: row.completed,
        cancelled: row.cancelled,
        revenue: row.revenue,
      }));

      const doctorWorkload: DoctorProductivityItem[] = docRes.rows.map((row) => ({
        doctorId: row.doctorId,
        doctorName: row.doctorName,
        specialization: row.specialization,
        sessionCount: row.sessionCount,
        patientCount: row.patientCount,
        completedCount: row.completedCount,
        revenue: 0,
      }));

      const recentSessions: DashboardSessionItem[] = sessionsRes.rows.map((row) => ({
        id: row.id,
        doctorId: row.doctorId,
        doctorName: row.doctorName,
        localDate: row.localDate,
        timeRange: row.timeRange,
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        completedCount: row.completedCount,
        status: row.status,
      }));

      return {
        timezone: tz,
        from,
        to,
        preset,
        kpis: {
          totalAppointments: totalAppts,
          completedAppointments: apptData.completed,
          waitingAppointments: apptData.waiting,
          inConsultationAppointments: apptData.in_consultation,
          cancelledAppointments: apptData.cancelled,
          noShowAppointments: apptData.no_show,
          totalInvoiced: money(issuedData.invoiced),
          totalCollected: money(finData.collected),
          cashCollected: money(finData.cash),
          cardCollected: money(finData.card),
          bankCollected: money(finData.bank),
          totalRefunded: money(refundData.refunded),
          outstandingBalance: money(outstandingData.outstanding),
          newPatientsCount: newPatients,
          returningPatientsCount: returningPatients,
          capacityUtilizationPct: utilization,
          averageWaitMinutes: Math.round(apptData.avg_wait_minutes),
          deltas: {
            appointmentsPct: apptsDelta,
            revenuePct: revenueDelta,
            collectedPct: collectedDelta,
          },
        },
        volumeTrends,
        doctorWorkload,
        hourlyDistribution,
        recentSessions,
      };
    });
  }
}
