// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), data: text('data').notNull(),
  version: integer('version').notNull().default(1), deleted: integer('deleted').notNull().default(0),
  occurrence: text('occurrence'), updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('record_occurrence').on(t.occurrence)]);
export const history = sqliteTable('history', { id: text('id').primaryKey(), recordId: text('record_id').notNull(), kind: text('kind').notNull(), data: text('data').notNull(), version: integer('version').notNull(), createdAt: text('created_at').notNull() });
export const requests = sqliteTable('requests', { id: text('id').primaryKey(), fingerprint: text('fingerprint').notNull(), result: text('result').notNull(), createdAt: text('created_at').notNull() });
export const completions = sqliteTable('completions', { id: text('id').primaryKey(), taskId: text('task_id').notNull(), cycle: integer('cycle').notNull(), requestId: text('request_id').notNull(), createdAt: text('created_at').notNull() }, t => [uniqueIndex('completion_cycle').on(t.taskId,t.cycle)]);
export const mutationGuards = sqliteTable('mutation_guards', { id: text('id').primaryKey(), valid: integer('valid').notNull() }, t => [check('valid_guard',sql`${t.valid} = 1`)]);
