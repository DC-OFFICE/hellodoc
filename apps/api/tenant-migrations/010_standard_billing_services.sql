-- Tenant migration 010: Ensure standard dispensary billing services are seeded

INSERT INTO __SCHEMA__.billing_services (id, code, name, description, price, currency, tax_classification, active, created_by)
VALUES
  (gen_random_uuid(), 'DOC_CONSULT', 'Doctor Consultation Fee', 'General practitioner or specialist consultation', 1500.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'CLINIC_FEE', 'Clinic / Facility Fee', 'Standard clinic operational and dispensary facility charge', 500.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'MEDICINES', 'Medicines / Pharmacy', 'Dispensed prescription medications and pharmaceutical supplies', 0.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'NURSING_PROCEDURE', 'Clinical Procedures / Dressing', 'Wound dressing, injections, minor suturing or nursing care', 750.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'LAB_INVESTIGATION', 'Laboratory & Diagnostic Tests', 'Diagnostic investigations, rapid blood tests, and lab screening', 1200.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'MEDICAL_CERTIFICATE', 'Medical Certificate / Report', 'Issuance of official clinical certificate or fitness report', 500.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'OTHER_SERVICES', 'Other Clinical Services', 'Miscellaneous clinical care, consumables, or specialized service', 0.00, 'LKR', 'EXEMPT', true, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;
