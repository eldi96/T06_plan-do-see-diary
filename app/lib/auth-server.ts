import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins/username';
import { drizzle } from 'drizzle-orm/d1';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { authSchema } from '@/db/auth-schema';

const SITE_ORIGIN = 'https://pds-study-planner.bronzeamber32.chatgpt.site';
const MAX_BODY_BYTES = 4096;
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = '$scrypt$32768$8$3$';
const LOGIN_ERROR = '아이디 또는 비밀번호를 확인해 주세요.';
type AuthBindings = { DB?: D1Database; PDS_AUTH_SECRET?: string; PDS_LEGACY_OWNER_USERNAME?: string; PDS_LEGACY_CLAIM_SECRET?: string };

// Algorithm implementation is Node's reviewed crypto primitive, not an application KDF.
function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, 64, SCRYPT,
    (error, key) => error ? reject(error) : resolve(key)));
}
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${HASH_PREFIX}${salt}$${(await deriveKey(password, salt)).toString('hex')}`;
}
async function verifyPassword({ password, hash }: { password: string; hash: string }) {
  if (!hash.startsWith(HASH_PREFIX)) return false;
  const [salt, digest, extra] = hash.slice(HASH_PREFIX.length).split('$');
  if (extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(digest ?? '')) return false;
  return timingSafeEqual(await deriveKey(password, salt), Buffer.from(digest, 'hex'));
}
function allowedOrigin(request: Request) {
  const url = new URL(request.url);
  if (url.origin === SITE_ORIGIN) return url.origin;
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return url.origin;
  throw new Error('허용되지 않은 서버 주소입니다.');
}
export function authJson(data: unknown, status = 200, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set('Content-Type', 'application/json; charset=utf-8');
  result.set('Cache-Control', 'no-store');
  result.set('Pragma', 'no-cache');
  result.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers: result });
}
export function assertSameOrigin(request: Request): Response | null {
  try {
    if (request.headers.get('origin') !== allowedOrigin(request) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return authJson({ error: '허용되지 않은 요청입니다.' }, 403);
    }
    return null;
  } catch { return authJson({ error: '허용되지 않은 요청입니다.' }, 403); }
}
export function getAuth(request: Request) {
  const bindings = env as AuthBindings;
  if (!bindings.DB || !bindings.PDS_AUTH_SECRET || bindings.PDS_AUTH_SECRET.length < 32) throw new Error('인증 서버 설정이 필요합니다.');
  const origin = allowedOrigin(request);
  return betterAuth({
    appName: 'PDS diary', baseURL: origin, basePath: '/api/auth', secret: bindings.PDS_AUTH_SECRET,
    database: drizzleAdapter(drizzle(bindings.DB, { schema: authSchema }), { provider: 'sqlite', schema: authSchema, transaction: false }),
    trustedOrigins: [origin],
    logger: { disabled: true },
    emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 4, maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword } },
    plugins: [username({ immutableUsername: true, displayUsername: false, minUsernameLength: 3, maxUsernameLength: 30 })],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 5, cookieCache: { enabled: false } },
    user: { deleteUser: { enabled: true } },
    account: { accountLinking: { enabled: false } },
    advanced: { useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30,
      customRules: { '/sign-in/username': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 } } },
  });
}
export async function requireSession(request: Request) {
  const value = await getAuth(request).api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  return value?.user.username ? value : null;
}
function publicUser(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  return { id: user.id, username: user.username, name: user.name };
}
function ownerSetupAllowed(name: string, value: unknown) {
  const bindings = env as AuthBindings;
  if (name !== (bindings.PDS_LEGACY_OWNER_USERNAME || 'eldi96').toLowerCase()) return true;
  const secret = bindings.PDS_LEGACY_CLAIM_SECRET;
  if (!secret || secret.length < 32 || typeof value !== 'string' || value.length !== secret.length) return false;
  const supplied = Buffer.from(value), expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
async function limitAccount(request: Request, accountName: string) {
  const bytes = new TextEncoder().encode(accountName);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const key = `account:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
  const now = Date.now(), cutoff = now - 60_000;
  const row = await (env as AuthBindings).DB!.prepare(`INSERT INTO auth_rate_limit(id,key,count,last_request) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN last_request <= ? THEN 1 ELSE count+1 END,
    last_request=CASE WHEN last_request <= ? THEN excluded.last_request ELSE last_request END RETURNING count`)
    .bind(key, key, now, cutoff, cutoff).first<{ count: number }>();
  return (row?.count ?? 11) <= 10;
}

export async function handleAuthRequest(request: Request): Promise<Response> {
  const action = new URL(request.url).pathname.slice('/api/auth/'.length);
  if (request.method === 'GET' && action === 'session') {
    try {
      const url = new URL('/api/auth/get-session', request.url);
      const response = await getAuth(request).handler(new Request(url, { headers: request.headers }));
      const session = await response.json() as { user?: { username?: string }; session?: { expiresAt?: string } } | null;
      const valid = response.ok && session?.user?.username;
      return authJson({ user: valid ? publicUser(session.user) : null, expiresAt: valid ? session.session?.expiresAt ?? null : null }, valid ? 200 : 401, response.headers);
    } catch { return authJson({ error: '인증 서비스를 사용할 수 없습니다.' }, 503); }
  }
  if (!['sign-up', 'sign-in', 'sign-out', 'change-password', 'delete-account'].includes(action)) return authJson({ error: '찾을 수 없습니다.' }, 404);
  if (request.method !== 'POST') return authJson({ error: '허용되지 않은 요청 방식입니다.' }, 405, { Allow: 'POST' });
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const body = await boundedBody(request);
  if (!body) return authJson({ error: '입력 형식을 확인해 주세요.' }, 400);
  const allowedKeys: Record<string, string[]> = { 'sign-up': ['username', 'password', 'ownerSetupKey'], 'sign-in': ['username', 'password'], 'sign-out': [],
    'change-password': ['currentPassword', 'newPassword'], 'delete-account': ['password'] };
  if (Object.keys(body).some(key => !allowedKeys[action].includes(key))) return authJson({ error: '입력 항목을 확인해 주세요.' }, 400);
  let stage = 'configuration';
  try {
    const auth = getAuth(request);
    let target = action, payload: Record<string, unknown> = body;
    if (action === 'sign-in' || action === 'sign-up') {
      if (typeof body.username !== 'string' || typeof body.password !== 'string') return authJson({ error: LOGIN_ERROR }, 400);
      const id = body.username.trim().toLowerCase();
      if (!/^[a-z0-9_.]{3,30}$/.test(id) || body.password.length < 4 || body.password.length > 128) return authJson({ error: action === 'sign-in' ? LOGIN_ERROR : '아이디는 영문·숫자·밑줄·점 3~30자, 비밀번호는 4~128자로 입력해 주세요.' }, 400);
      stage = 'account-rate-limit';
      if (!await limitAccount(request, id)) return authJson({ error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, { 'Retry-After': '60' });
      if (action === 'sign-up' && !ownerSetupAllowed(id, body.ownerSetupKey)) return authJson({ code: 'OWNER_SETUP_REQUIRED', error: '기존 기록을 보호하는 아이디입니다. 기존 기록 연결 확인코드를 입력하거나 확인해 주세요.' }, 400);
      target = action === 'sign-up' ? 'sign-up/email' : 'sign-in/username';
      payload = action === 'sign-up' ? { username: id, name: id, email: `${crypto.randomUUID()}@accounts.invalid`, password: body.password } : { username: id, password: body.password };
    }
    if (action === 'change-password') {
      if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string' || body.currentPassword.length > 128 || body.newPassword.length < 4 || body.newPassword.length > 128) return authJson({ error: '비밀번호는 4~128자로 입력해 주세요.' }, 400);
      payload = { ...body, revokeOtherSessions: true };
    }
    if (action === 'delete-account') {
      if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 128) return authJson({ error: '현재 비밀번호를 입력해 주세요.' }, 400);
      target = 'delete-user';
    }
    const headers = new Headers(request.headers); headers.delete('content-length'); headers.set('content-type', 'application/json');
    const url = new URL(`/api/auth/${target}`, request.url);
    stage = 'library-handler';
    const response = await auth.handler(new Request(url, { method: 'POST', headers, body: JSON.stringify(payload) }));
    stage = 'library-response';
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      if (action === 'sign-up' && result.code === 'USERNAME_IS_ALREADY_TAKEN') return authJson({code: 'USERNAME_TAKEN', error: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.'}, 400);
      const message = action === 'sign-in' ? LOGIN_ERROR : response.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.' : action === 'sign-up' ? '가입할 수 없습니다. 아이디와 입력 내용을 확인해 주세요.' : '요청을 처리할 수 없습니다. 현재 비밀번호와 로그인 상태를 확인해 주세요.';
      return authJson({ error: message }, response.status);
    }
    // Changing a password rotates the library session; explicitly end the new one too.
    if (action === 'change-password') {
      // Old cookie has already been revoked. The newly returned token identifies only the replacement session.
      if (typeof result.token === 'string') await (env as AuthBindings).DB!.prepare('DELETE FROM auth_session WHERE token=?').bind(result.token).run();
    }
    const responseHeaders = new Headers(response.headers);
    if (action === 'change-password') {
      const cookies = response.headers.getSetCookie();
      responseHeaders.delete('set-cookie');
      for (const cookie of cookies) {
        const name = cookie.slice(0, cookie.indexOf('='));
        responseHeaders.append('set-cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${new URL(request.url).protocol === 'https:' ? ' Secure;' : ''}`);
      }
    }
    return authJson({ success: true, ...(result.user ? { user: publicUser(result.user) } : {}) }, 200, responseHeaders);
  } catch (error) {
    // Local diagnostics identify only control-flow stages and exception classes; never payloads or SQL.
    if (new URL(request.url).hostname === '127.0.0.1') {
      const diagnostic = error instanceof Error ? `${error.message} ${(error.cause as Error | undefined)?.message ?? ''}`.toLowerCase() : '';
      const category = ['no such table', 'no such column', 'datatype mismatch', 'constraint', 'schema', 'json', 'body', 'scrypt', 'memory', 'secret', 'invalid'].find(key => diagnostic.includes(key)) ?? 'unclassified';
      console.warn('인증 단계 오류', stage, error instanceof Error ? error.name : 'unknown', category);
    }
    return authJson({ error: '인증 요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}

