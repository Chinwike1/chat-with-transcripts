import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'
import { LibSQLStore } from '@mastra/libsql'
import { chatWithTranscriptsAgent } from './agents/chat-with-transcripts-agent'
import { transcriptsWorkflow } from './workflows/transcripts-workflow'
import { PgVector, PostgresStore } from '@mastra/pg'

const connectionString = process.env.POSTGRES_CONNECTION_STRING
if (!connectionString) {
  throw new Error('POSTGRES_CONNECTION_STRING environment variable is required')
}
const pgVector = new PgVector({ connectionString })
const pgStorage = new PostgresStore({ connectionString })

export const mastra = new Mastra({
  workflows: { transcriptsWorkflow },
  agents: { chatWithTranscriptsAgent },
  storage: pgStorage,
  vectors: {
    pg: pgVector,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
})
