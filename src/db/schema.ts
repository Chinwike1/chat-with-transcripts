import { index, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core'
import { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { customType } from 'drizzle-orm/pg-core'

// define tsvector type for PG full text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const transcripts = pgTable(
  'transcripts',
  {
    id: serial('id').primaryKey(),
    episode_title: text('episode_title').notNull(),
    speakers: text('speakers').array().notNull(),
    source: varchar('source', { length: 1000 }).notNull(),
    summary: text('summary'),
    searchVector: tsvector('search_vector'),
  },
  // create GIN index (recommended) for full text search
  (table) => [index('search_ts_index').using('gin', table.searchVector)]
)

export type Transcript = InferSelectModel<typeof transcripts>
export type NewTranscript = InferInsertModel<typeof transcripts>

const pool = new Pool({
  connectionString: process.env.POSTGRES_CONNECTION_STRING!,
})

export const db = drizzle(pool)
