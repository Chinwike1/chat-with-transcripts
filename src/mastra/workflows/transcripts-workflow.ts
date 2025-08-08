import { openai } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { chunkSingleTranscript, fetchAndParseTranscript } from '../../lib/utils'

const chunkInputSchema = z.object({
  metadata: z.object({
    episode_title: z.string(),
    total_speakers: z.array(z.string()),
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

const chunksWithMetadataSchema = z.array(
  z.object({
    text: z.string(),
    metadata: z.object({
      episode_title: z.string(),
      total_speakers: z.array(z.string()),
      source: z.string(),
      source_type: z.string(),
      timestamp_start: z.string(),
      timestamp_end: z.string(),
      speakers_in_chunk: z.array(z.string()),
      entries_count: z.number(),
      chunk_id: z.string(),
    }),
  })
)

const fetchAndParseTranscriptStep = createStep({
  id: 'fetch-and-parse-transcript',
  description: 'Fetch and parse the transcript content from a URL',
  inputSchema: z.object({
    url: z.string(),
  }),
  outputSchema: chunkInputSchema,
  execute: async ({ inputData }) => {
    return await fetchAndParseTranscript(inputData.url)
  },
})

const chunkTranscriptStep = createStep({
  id: 'chunk-transcript',
  description:
    'Chunks the JSON transcript content into smaller chunks and attaches relevant metadata',
  inputSchema: chunkInputSchema,
  outputSchema: z.object({
    chunks: chunksWithMetadataSchema,
  }),
  execute: async ({ inputData }) => {
    const result = await chunkSingleTranscript(inputData)
    return { chunks: result }
  },
})

const embedSingleTranscriptChunks = createStep({
  id: 'embed-single-transcript-chunks',
  description: 'Embed a single transcript chunks with their metadata',
  inputSchema: z.object({
    chunks: chunksWithMetadataSchema,
  }),
  outputSchema: z.object({ success: z.boolean() }),
  async execute({ inputData, mastra }) {
    const { embeddings: batchEmbeddings } = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values: inputData.chunks.map((chunk) => chunk.text),
    })

    const vectorStore = mastra.getVector('pg')

    // delete existing index (if exists)
    await vectorStore.deleteIndex({ indexName: 'transcripts' })

    await vectorStore.createIndex({
      indexName: 'transcripts',
      dimension: 1536,
    })

    // upsert embedded vectors with full metadata including text
    await vectorStore.upsert({
      indexName: 'transcripts',
      vectors: batchEmbeddings,
      metadata: inputData.chunks.map((chunk) => ({
        ...chunk.metadata,
        text: chunk.text,
      })),
    })

    console.log('Chunks embedded with metadata')

    return { success: true }
  },
})

// Single Transcript Workflow
const singleTranscriptWorkflow = createWorkflow({
  id: 'single-transcript-workflow',
  inputSchema: z.object({
    url: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
  steps: [
    fetchAndParseTranscriptStep,
    chunkTranscriptStep,
    embedSingleTranscriptChunks,
  ],
})
  .then(fetchAndParseTranscriptStep)
  .then(chunkTranscriptStep)
  .then(embedSingleTranscriptChunks)
  .commit()

const parseAndChunkMultipleTranscriptsStep = createStep({
  id: 'process-and-chunk-multiple-transcripts',
  description: 'Process multiple transcript URLs and combine their chunks',
  inputSchema: z.object({
    urls: z.array(z.string()),
  }),
  outputSchema: z.object({
    allChunks: chunksWithMetadataSchema,
    processedUrls: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const allChunks: any[] = []
    const processedUrls: string[] = []

    console.log('Starting chunking process')

    // loop through transcript urls to fetch, parse and chunk them
    for (const url of inputData.urls) {
      try {
        console.log(`Processing transcript: ${url}`)

        const parsed = await fetchAndParseTranscript(url)

        const result = await chunkSingleTranscript(parsed)

        // add chunks to collection
        allChunks.push(...result)
        processedUrls.push(url)

        console.log(
          `Successfully processed transcript: ${url} (${result.length} chunks)`
        )
      } catch (error) {
        console.error(`Failed to process transcript ${url}:`, error)
      }
    }

    console.log(
      `Total chunks processed: ${allChunks.length} from ${processedUrls.length} transcripts`
    )
    return { allChunks, processedUrls }
  },
})

const embedMultipleTranscriptChunks = createStep({
  id: 'embed-multiple-transcript-chunks',
  description: 'Embed multiple transcript chunks with their metadata',
  inputSchema: z.object({
    allChunks: chunksWithMetadataSchema,
    processedUrls: z.array(z.string()),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalChunks: z.number(),
    processedUrls: z.array(z.string()),
  }),
  async execute({ inputData, mastra }) {
    if (inputData.allChunks.length === 0) {
      console.log('No chunks to embed')
      return {
        success: true,
        totalChunks: 0,
        processedUrls: inputData.processedUrls,
      }
    }

    const { embeddings: batchEmbeddings } = await embedMany({
      model: openai.embedding('text-embedding-3-small'),
      values: inputData.allChunks.map((chunk) => chunk.text),
    })

    const vectorStore = mastra.getVector('pg')

    // check if index exists, if not create it
    try {
      await vectorStore.createIndex({
        indexName: 'transcripts',
        dimension: 1536,
      })
      console.log('Created new transcripts index')
    } catch (error) {
      console.log('Using existing transcripts index')
    }

    // upsert embedded vectors with full metadata including text
    await vectorStore.upsert({
      indexName: 'transcripts',
      vectors: batchEmbeddings,
      metadata: inputData.allChunks.map((chunk) => ({
        ...chunk.metadata,
        text: chunk.text,
      })),
    })

    console.log(
      `Successfully embedded ${inputData.allChunks.length} chunks with metadata`
    )

    return {
      success: true,
      totalChunks: inputData.allChunks.length,
      processedUrls: inputData.processedUrls,
    }
  },
})

// Multiple Transcript Workflow
const multipleTranscriptsWorkflow = createWorkflow({
  id: 'multi-transcripts-workflow',
  inputSchema: z.object({
    urls: z.array(z.string()).describe('Array of transcript URLs to process'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalChunks: z.number(),
    processedUrls: z.array(z.string()),
  }),
  steps: [parseAndChunkMultipleTranscriptsStep, embedMultipleTranscriptChunks],
})
  .then(parseAndChunkMultipleTranscriptsStep)
  .then(embedMultipleTranscriptChunks)
  .commit()

export { singleTranscriptWorkflow, multipleTranscriptsWorkflow }
