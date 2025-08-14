import { openai } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { chunkSingleTranscript, fetchAndParseTranscript } from '../../lib/utils'
import { ChunkWithMetadata, TranscriptData } from '../../types'
import { db, transcripts } from '../../db/schema'
import { eq } from 'drizzle-orm'

const parsedTranscriptSchema = z.object({
  metadata: z.object({
    episode_title: z.string(),
    speakers: z.array(z.string()),
    summary: z.string().nullable(),
    source: z.string(),
  }),
  transcript: z.array(
    z.object({
      timestamp: z.string(),
      speaker: z.string(),
      text: z.string(),
    })
  ),
})

const chunksWithMetadataSchema = z.object({
  text: z.string(),
  metadata: z.object({
    // transcript_id: z.number(),
    chunk_id: z.string(),
    episode_title: z.string(),
    speakers: z.array(z.string()),
    source: z.string(),
    timestamp_start: z.string(),
    timestamp_end: z.string(),
    speakers_in_chunk: z.array(z.string()),
    entries_count: z.number(),
  }),
})

const embeddingResultSchema = z.object({
  success: z.boolean(),
  totalChunks: z.number(),
})

const fetchAndParseTranscriptStep = createStep({
  id: 'fetch-and-parse-transcript',
  description: 'Fetch and parse the transcript content from a URL',
  inputSchema: z.object({
    urls: z.array(z.string()),
  }),
  outputSchema: parsedTranscriptSchema.array(),
  execute: async ({ inputData }) => {
    // loop through transcript urls to fetch and parse
    let parsedTranscripts: TranscriptData[] = []
    for (const url of inputData.urls) {
      try {
        const parsed = await fetchAndParseTranscript(url)
        parsedTranscripts.push(parsed)
      } catch (error) {
        console.error(`Failed to process transcript ${url}:`, error)
      }
    }
    console.log(`Parsed ${parsedTranscripts.length} transcripts`)
    return parsedTranscripts
  },
})

export const summarizeAndStoreTranscripts = createStep({
  id: 'summarize-and-store-transcripts',
  description:
    'Summarizes transcript content and stores it in the database. Summary only generated if missing.',
  inputSchema: parsedTranscriptSchema.array(),
  outputSchema: parsedTranscriptSchema.array(),
  execute: async ({ inputData, mastra }) => {
    console.log('Starting transcript summarization')
    const results: typeof inputData = []

    for (const transcript of inputData) {
      // 1. check if transcript exists
      const existing = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.episode_title, transcript.metadata.episode_title))
        .limit(1)

      if (existing.length > 0) {
        console.log(
          `Transcript for "${transcript.metadata.episode_title}" already exists, skipping.`
        )
        results.push(transcript)
        continue
      }

      console.log('exisiting summary?: ', existing[0]?.summary)

      // 2. use the summary from transcript metadata if available, otherwise, generate a new summary
      let summaryToStore = existing[0]?.summary
        ? existing[0]?.summary
        : transcript.metadata.summary
      if (!summaryToStore || summaryToStore.trim() === '') {
        // merge full transcript text
        const fullText = transcript.transcript.map((t) => t.text).join(' ')

        // summarize with summarizer agent
        const transcriptSummarizationAgent = mastra?.getAgent(
          'transcriptSummarizationAgent'
        )
        const summaryResult = await transcriptSummarizationAgent.generate([
          {
            role: 'user',
            content: `Provide a SHORT summary of this transcript text:\n\n${fullText}`,
          },
        ])

        console.log('generated summary: ', summaryResult.text)
        summaryToStore = summaryResult.text
      }

      // 3. Insert into DB
      try {
        await db.insert(transcripts).values({
          episode_title: transcript.metadata.episode_title,
          speakers: transcript.metadata.speakers,
          source: transcript.metadata.source,
          summary: summaryToStore,
        })
      } catch (error) {
        console.log('Error inserting summary')
      }

      results.push(transcript)
    }
    return inputData
  },
})

const chunkTranscriptsStep = createStep({
  id: 'chunk-transcripts',
  description:
    'Chunks the JSON transcript content into smaller chunks and attaches relevant metadata',
  inputSchema: parsedTranscriptSchema.array(),
  outputSchema: z.object({
    chunks: chunksWithMetadataSchema.array(),
  }),
  execute: async ({ inputData }) => {
    console.log('Starting chunking process')
    const chunks: ChunkWithMetadata[] = []
    // loop through transcripts and chunk them
    for (const transcript of inputData) {
      try {
        const result = await chunkSingleTranscript(transcript)
        // add chunks to collection
        chunks.push(...result)
      } catch (error) {
        console.error('Failed to chunk transcripts:', error)
      }
    }
    console.log(`Chunked ${inputData.length} transcripts into ${chunks.length}`)
    return { chunks }
  },
})

const embedTranscriptChunks = createStep({
  id: 'embed-transcript-chunks',
  description: 'Embed transcript chunks with their metadata',
  inputSchema: z.object({
    chunks: chunksWithMetadataSchema.array(),
  }),
  outputSchema: embeddingResultSchema,
  async execute({ inputData, mastra }) {
    const chunks = inputData.chunks

    if (chunks.length === 0) {
      console.log('No chunks to embed')
      return {
        success: true,
        totalChunks: 0,
      }
    }

    const { embeddings } = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values: chunks.map((chunk) => chunk.text),
    })

    const vectorStore = mastra.getVector('pg')

    // check if index exists, if not create it
    try {
      await vectorStore.createIndex({
        indexName: 'transcript_embeddings',
        dimension: 1536,
      })
      console.log('Created new _embeddings index')
    } catch (error) {
      console.log('Using existing transcripts index')
    }

    // upsert embedded vectors with full metadata including text
    await vectorStore.upsert({
      indexName: 'transcript_embeddings',
      vectors: embeddings,
      metadata: chunks.map((chunk) => ({
        ...chunk.metadata,
        text: chunk.text,
      })),
    })

    console.log(`Successfully embedded ${chunks.length} chunks with metadata`)

    return {
      success: true,
      totalChunks: chunks.length,
    }
  },
})

const processTranscriptsWorkflow = createWorkflow({
  id: 'process-transcripts-workflow',
  inputSchema: z.object({
    urls: z.array(z.string()).describe('Array of transcript URLs to process'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalChunks: z.number(),
    processedUrls: z.array(z.string()),
  }),
  steps: [
    fetchAndParseTranscriptStep,
    summarizeAndStoreTranscripts,
    chunkTranscriptsStep,
    embedTranscriptChunks,
  ],
})
  .then(fetchAndParseTranscriptStep)
  .then(summarizeAndStoreTranscripts)
  .then(chunkTranscriptsStep)
  .then(embedTranscriptChunks)
  .commit()

export { processTranscriptsWorkflow }
