import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  email: text('email').notNull().unique(), emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'), username: text('username').unique(),
  createdAt: timestamp('created_at').notNull(), updatedAt: timestamp('updated_at').notNull(),
});
export const authSession = sqliteTable('auth_session', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(), createdAt: timestamp('created_at').notNull(), updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
}, t => [index('auth_session_user').on(t.userId)]);
export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'), refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'), password: text('password'), createdAt: timestamp('created_at').notNull(), updatedAt: timestamp('updated_at').notNull(),
}, t => [index('auth_account_user').on(t.userId)]);
export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(), createdAt: timestamp('created_at').notNull(), updatedAt: timestamp('updated_at').notNull(),
}, t => [index('auth_verification_identifier').on(t.identifier)]);
export const authRateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('last_request').notNull(),
});
export const authSchema = { user: authUser, session: authSession, account: authAccount, verification: authVerification, rateLimit: authRateLimit };
