import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationsService } from '../../src/clinic-notifications/notifications.service.js';
import { gatewaySkipReason } from '../../src/platform-sms/sms-gateway.types.js';

const settings = {
  id: 'settings',
  enabled: true,
  booking_confirmation_enabled: true,
  cancellation_enabled: true,
  reschedule_enabled: true,
  approaching_turn_enabled: true,
  delay_alert_enabled: true,
  approaching_threshold: 3,
  approved_sender_id: null,
  language: 'en',
};

const appointment = {
  id: 'appt',
  patient_id: 'patient',
  session_id: 'session',
  queue_number: 1,
  status: 'CONFIRMED',
  local_date: '2026-11-19',
  start_at: new Date('2026-11-19T09:00:00Z'),
  end_at: new Date('2026-11-19T10:00:00Z'),
};

const contact = {
  id: 'contact',
  contact_type: 'MOBILE',
  normalized_value: '+94771234567',
  display_value: '0771234567',
};

function service(runtime: { enabled: boolean; canSend: boolean; senderId?: string }) {
  const gateway = {
    getRuntimeConfig: async () => ({
      enabled: runtime.enabled,
      canSend: runtime.canSend,
      baseUrl: 'https://smslenz.lk',
      userId: '1',
      senderId: runtime.senderId ?? '',
      apiKey: '',
      connectionTimeoutMs: 30000,
      readTimeoutMs: 30000,
    }),
  };
  return new NotificationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    gateway as never,
    {} as never,
  );
}

async function enqueue(runtime: { enabled: boolean; canSend: boolean }) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('notification_settings')) return { rows: [settings] };
      if (sql.includes('consultation_sessions')) return { rows: [appointment] };
      if (sql.includes('patient_contacts')) return { rows: [contact] };
      return { rows: [], rowCount: 1 };
    },
  };
  const result = await service(runtime).enqueueForAppointment(client as never, {
    userId: 'user',
    tenantId: 'tenant',
    clinicName: 'Clinic',
    schemaName: 'clinic_test_123456',
    quotedSchema: '"clinic_test_123456"',
    role: 'CLINIC_MANAGER',
    doctorId: null,
  }, {
    appointmentId: appointment.id,
    eventType: 'BOOKING_CONFIRMATION',
    dedupeKey: 'dedupe-1',
    includeTrackingLink: false,
  });
  return { result, queries };
}

describe('platform gateway enqueue gate', () => {
  it('classifies a disabled gateway separately from a missing key', () => {
    assert.equal(gatewaySkipReason({ enabled: false, canSend: false }), 'PLATFORM_DISABLED');
    assert.equal(gatewaySkipReason({ enabled: true, canSend: false }), 'GATEWAY_UNCONFIGURED');
    assert.equal(gatewaySkipReason({ enabled: true, canSend: true }), null);
  });

  it('records SKIPPED and does not create a dispatch claim when the gateway is off', async () => {
    const { result, queries } = await enqueue({ enabled: false, canSend: false });
    assert.equal(result, 'SKIPPED');
    const insert = queries.find((query) => query.sql.includes('error_category'));
    assert.ok(insert);
    assert.match(insert.sql, /'SKIPPED'/);
    assert.equal(insert.params.includes('PLATFORM_DISABLED'), true);
    assert.equal(
      queries.some((query) => query.sql.includes('sms_dispatch_index')),
      false,
    );
  });
});
