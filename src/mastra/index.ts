import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'
import { chatWithTranscriptsAgent } from './agents/chat-with-transcripts-agent'
import {
  singleTranscriptWorkflow,
  multipleTranscriptsWorkflow,
} from './workflows/transcripts-workflow'
import { PgVector, PostgresStore } from '@mastra/pg'

// initialize pg vector storage
const connectionString = process.env.POSTGRES_CONNECTION_STRING
if (!connectionString) {
  throw new Error('POSTGRES_CONNECTION_STRING environment variable is required')
}
const pgVector = new PgVector({ connectionString })
const pgStorage = new PostgresStore({ connectionString })

export const mastra = new Mastra({
  workflows: {
    singleTranscriptWorkflow,
    multipleTranscriptsWorkflow,
  },
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
