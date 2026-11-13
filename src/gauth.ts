/**
 * Sign-in through GAuth (https://auth.gpeake.com), the owner's passkey SAML
 * identity provider, with Better Auth and @better-auth/sso as the service
 * provider. Configured as GAuth's admin snippet says (written for 1.7.18;
 * recheck on upgrade).
 *
 * GAuth is the only way in: no passwords, and only people GAuth gives the
 * `owner` role for this site get a session.
 *
 * Loaded only with a dynamic import() (src/auth.ts), so the cron and the queue
 * consumer never evaluate Better Auth or the SAML libraries.
 */
import { sso } from '@better-auth/sso';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { Env } from './index';

export const GAUTH_PROVIDER = 'gauth';
/** The GAuth role that may use the admin. */
export const OWNER_ROLE = 'owner';
const SESSION_SECONDS = 60 * 60 * 12;

/** The PEM certificates in a string (a var can't hold a list). */
export const parseCerts = (pems: string | undefined) =>
  (pems ?? '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];

/** Where GAuth must send sign-ins, and what it knows this site as: register both in GAuth. */
export const gauthEndpoints = (appOrigin: string) => ({
  entityId: `${appOrigin}/api/auth/sso/saml2/sp/metadata?providerId=${GAUTH_PROVIDER}`,
  acsUrl: `${appOrigin}/api/auth/sso/saml2/sp/acs/${GAUTH_PROVIDER}`,
});

/** Roles as Better Auth stores them (string[] in a JSON text column). */
export function rolesOf(user: { roles?: unknown }): string[] {
  const raw = user.roles;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = null;
    }
  }
  return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : [];
}

function build(env: Env) {
  const appOrigin = env.APP_ORIGIN;
  const certs = parseCerts(env.GAUTH_CERTS);
  if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');
  if (!appOrigin || !env.GAUTH_ORIGIN || certs.length === 0) throw new Error('APP_ORIGIN / GAUTH_ORIGIN / GAUTH_CERTS are not set');
  const { entityId } = gauthEndpoints(appOrigin);

  const auth = betterAuth({
    baseURL: appOrigin,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    // GAuth is the only way in: no passwords, no sign-up of the site's own.
    emailAndPassword: { enabled: false },
    // Sessions end on schedule, so disabling someone, revoking a role, or
    // recovering an account in GAuth reaches the site within this time.
    session: { expiresIn: SESSION_SECONDS, disableSessionRefresh: true },
    // A GAuth sign-in attaches only to the account it created (keyed on the
    // permanent GAuth user id), never to an existing user with the same email.
    account: { accountLinking: { disableImplicitLinking: true } },
    // Roles live on the user, and only the server can set them.
    user: { additionalFields: { roles: { type: 'string[]', required: false, input: false } } },
    rateLimit: { enabled: true, storage: 'database', customRules: { '/sign-in/sso': { window: 60, max: 10 } } },
    // Cookies stay host-only (Better Auth's default; never set
    // crossSubDomainCookies, which would hand them to every *.gpeake.com site).
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    plugins: [
      sso({
        // GAuth is the only identity provider. Nobody can register another one
        // through the API (which would let them sign in as anyone).
        providersLimit: 0,
        defaultSSO: [
          {
            providerId: GAUTH_PROVIDER,
            // Don't turn on domainVerification for this provider: it would make
            // GAuth trusted for every address at this domain.
            domain: new URL(appOrigin).hostname,
            samlConfig: {
              // In Better Auth this names the site (the service provider), not GAuth.
              issuer: entityId,
              entryPoint: `${env.GAUTH_ORIGIN}/saml/sso`,
              idpMetadata: { entityID: `${env.GAUTH_ORIGIN}/saml/metadata`, cert: certs },
              spMetadata: { entityID: entityId },
              wantAssertionsSigned: true,
              identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
              mapping: {
                email: 'email',
                emailVerified: 'emailVerified',
                // Chosen by the person: render it as text.
                name: 'displayName',
                extraFields: { roles: 'roles' },
              },
              // Required by the types; only used in metadata Better Auth generates.
              callbackUrl: `${appOrigin}/`,
            },
          },
        ],
        // Answers must match a request this site sent (no unsolicited sign-ins),
        // and carry their validity window, with at most a minute of clock skew.
        saml: { enableInResponseToValidation: true, allowIdpInitiated: false, requireTimestamps: true, clockSkew: 60_000 },
        // Safe because GAuth is the only provider and accounts never link on email.
        trustEmailVerified: true,
        // Roles, email and name change in GAuth, so copy them at every sign-in.
        provisionUserOnEveryLogin: true,
        provisionUser: async ({ user, userInfo, provider }) => {
          if (provider.providerId !== GAUTH_PROVIDER) return;
          // One role arrives as a string, several as an array.
          const raw = userInfo.roles;
          const roles = (Array.isArray(raw) ? raw : [raw]).filter((r): r is string => typeof r === 'string' && r !== '');
          const ctx = await auth.$context;
          if (!roles.includes(OWNER_ROLE)) {
            // Better Auth has already made a session; undo the sign-in.
            await ctx.internalAdapter.deleteUserSessions(user.id);
            throw new APIError('FOUND', undefined, { Location: '/login?error=no_role' });
          }
          // If the new email belongs to another user, the update fails and so
          // does the sign-in, rather than merging them.
          await ctx.internalAdapter.updateUser(user.id, {
            roles,
            email: String(userInfo.email),
            emailVerified: userInfo.emailVerified === true,
            name: String(userInfo.name ?? userInfo.email),
          });
        },
      }),
    ],
  });
  return auth;
}

export type Auth = ReturnType<typeof build>;

const instances = new WeakMap<Env, Auth>();

/** One Better Auth per environment. */
export function getAuth(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = build(env);
    instances.set(env, auth);
  }
  return auth;
}

/** Whether these request headers carry a session of someone with the owner role. */
export async function isOwner(auth: Auth, headers: Headers): Promise<boolean> {
  const result = await auth.api.getSession({ headers });
  return result !== null && rolesOf(result.user as { roles?: unknown }).includes(OWNER_ROLE);
}
