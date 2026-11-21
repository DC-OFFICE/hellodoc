-- Seed Platform Admin User
INSERT INTO "platform"."PlatformUser" ("id", "name", "email", "emailNormalized", "passwordHash", "active", "createdAt", "updatedAt")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'DartCodes Admin',
    'admin@dartcodes.lk',
    'admin@dartcodes.lk',
    '$argon2id$v=19$m=19456,t=2,p=1$uMyp7prDTRU8PBoQy91NQw$2k+JCMElwmCZ+62SdDAp26yvcoraikalIr1hrVQjzAU',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("emailNormalized") DO UPDATE
SET "passwordHash" = EXCLUDED."passwordHash",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Seed Platform Admin Role
INSERT INTO "platform"."PlatformAdmin" ("id", "userId", "active", "createdAt")
SELECT gen_random_uuid(), u."id", true, CURRENT_TIMESTAMP
FROM "platform"."PlatformUser" u
WHERE u."emailNormalized" = 'admin@dartcodes.lk'
ON CONFLICT ("userId") DO UPDATE
SET "active" = true;

-- Seed Specializations
INSERT INTO "platform"."Specialization" ("id", "name", "nameNormalized", "active", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'General Practitioner', 'general practitioner', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Family Medicine', 'family medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Internal Medicine', 'internal medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Pediatrics', 'pediatrics', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Obstetrics and Gynaecology', 'obstetrics and gynaecology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Cardiology', 'cardiology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Dermatology', 'dermatology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Orthopaedics', 'orthopaedics', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ENT', 'ent', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Ophthalmology', 'ophthalmology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Psychiatry', 'psychiatry', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Radiology', 'radiology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Anaesthesiology', 'anaesthesiology', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Emergency Medicine', 'emergency medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Dental Surgery', 'dental surgery', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Ayurvedic Medicine', 'ayurvedic medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nameNormalized") DO NOTHING;

-- Seed Qualifications
INSERT INTO "platform"."Qualification" ("id", "name", "nameNormalized", "active", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'MBBS', 'mbbs', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'MD', 'md', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'MS', 'ms', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'MRCP', 'mrcp', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'FRCS', 'frcs', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'DCH', 'dch', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'DO', 'do', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'MDS', 'mds', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'BDS', 'bds', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Diploma in Family Medicine', 'diploma in family medicine', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Board Certified Specialist', 'board certified specialist', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Consultant Physician', 'consultant physician', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("nameNormalized") DO NOTHING;
