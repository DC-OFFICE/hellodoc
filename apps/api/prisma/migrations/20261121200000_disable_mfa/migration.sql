-- Disable MFA: clear all active challenges, recovery codes, and MFA registrations across all users
TRUNCATE TABLE "platform"."user_mfa_recovery_codes", "platform"."mfa_challenges", "platform"."user_mfa" CASCADE;
