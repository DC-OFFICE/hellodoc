export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.MFA_REQUIRED !== 'true') problems.push('MFA_REQUIRED must be true');
  const key = env.SMS_PAYLOAD_ENCRYPTION_KEY ?? '';
  if (!key || key.includes('dev-only') || key.includes('change-me')) {
    problems.push('SMS_PAYLOAD_ENCRYPTION_KEY must be a production secret');
  }
  const cors = env.CORS_ORIGIN ?? '';
  if (!cors || cors.includes('localhost') || cors.includes('127.0.0.1')) {
    problems.push('CORS_ORIGIN must list the production web origin');
  }
  const origin = env.PUBLIC_WEB_ORIGIN ?? '';
  if (!origin.startsWith('https://')) problems.push('PUBLIC_WEB_ORIGIN must be https');
  if ((env.SMS_PROVIDER ?? 'fake') === 'fake' && env.SMS_DISPATCH_ENABLED !== 'false') {
    problems.push('SMS_DISPATCH_ENABLED must be false until a live provider is verified, or SMS_PROVIDER must not be fake');
  }
  return problems;
}
