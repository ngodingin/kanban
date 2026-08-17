import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core'

// Minimal Global DB schema scaffold (Drizzle)
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  owner_user_id: text('owner_user_id').notNull(),
  created_at: timestamp('created_at').notNull(),
  archived_at: timestamp('archived_at'),
  deleted_at: timestamp('deleted_at')
})

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  created_at: timestamp('created_at').notNull()
})

// Add more Global tables per 0.4.1 when schema decisions finalized
