-- HelloDoc local PostgreSQL bootstrap (administrator session only)
-- Never commit real production passwords.
--
-- Step A — connect to database "postgres" and run:

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hellodoc') THEN
    CREATE ROLE hellodoc WITH LOGIN PASSWORD 'hellodoc_dev_change_me';
  END IF;
END
$$;

-- Run once; skip if database already exists:
CREATE DATABASE hellodoc OWNER hellodoc;

-- Step B — connect to database "hellodoc" and run:

CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION hellodoc;
GRANT ALL ON SCHEMA platform TO hellodoc;
GRANT CREATE ON DATABASE hellodoc TO hellodoc;
ALTER ROLE hellodoc SET search_path TO platform, public;

-- Then from the HelloDoc repo:
--   npm run db:migrate
--   npm run db:generate
--   npm run create-platform-admin -- --email=... --name=... --password=...
