import { openai } from '@ai-sdk/openai'
import { embedMany } from 'ai'
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { MDocument } from '@mastra/rag'
import { ChunkWithMetadata, TranscriptEntry } from 'types'
import { z } from 'zod'

// https://gist.githubusercontent.com/Chinwike1/a745c2bcecd053915b8f8f0f38c8c63d/raw/c30ea27ef03c807969cf7fd2594364902359dc64/production_ready_rag_workshop_transcript.json

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

const fetchTranscriptStep = createStep({
  id: 'fetch-transcript',
  description: 'Fetch the transcript content of a file',
  inputSchema: z.object({
    url: z.string(),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ inputData }) => {
    console.log('Fetching transcript from', inputData.url)
    const response = await fetch(inputData.url)
    const text = await response.text()
    return { text }
  },
})

const parseTranscriptStep = createStep({
  id: 'parse-transcript',
  description: 'Parse the JSON transcript text into structured data',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: chunkInputSchema,
  execute: async ({ inputData }) => {
    const parsed = JSON.parse(inputData.text)
    return parsed
  },
})

const chunkTranscriptStep = createStep({
  id: 'chunk-transcript',
  description:
    'Chunks the JSON transcript content into smaller chunks and attaches relevant metadata',
  inputSchema: chunkInputSchema,
  outputSchema: z.object({
    chunks: z.array(
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
    ),
  }),
  execute: async ({ inputData }) => {
    // we use a lineId ([[index]]) prepended to each transcript entry, allowing us to trace which original entries are included in each chunk after chunking.
    const transcriptLines: string[] = []
    const entryMap: { [lineId: string]: TranscriptEntry } = {}

    inputData.transcript.forEach((entry, index) => {
      if (entry.text && entry.text.trim()) {
        const lineId = `[[${index}]]`
        const lineText = `${lineId} ${entry.text.trim()}`
        transcriptLines.push(lineText)
        entryMap[lineId] = entry
      }
    })

    const fullTranscriptText = transcriptLines.join('\n')

    const doc = new MDocument({
      docs: [
        {
          text: fullTranscriptText,
          metadata: {
            episode_title: inputData.metadata.episode_title,
            total_speakers: inputData.metadata.total_speakers,
            source: inputData.metadata.source,
          },
        },
      ],
      type: 'transcript',
    })

    // chunk document
    const chunks = await doc.chunk({
      strategy: 'sentence',
      maxSize: 600,
      overlap: 60,
    })

    // enrich each chunk with metadata by detecting which entries it spans
    const result: ChunkWithMetadata[] = chunks.map((chunk, index) => {
      const entryIndices = Array.from(
        chunk.text.matchAll(/\[\[(\d+)\]\]/g)
      ).map((match) => parseInt(match[1], 10))
      const uniqueIndices = Array.from(new Set(entryIndices)).sort(
        (a, b) => a - b
      )
      const matchedEntries = uniqueIndices.map((i) => inputData.transcript[i])

      const firstEntry = matchedEntries[0]
      const lastEntry = matchedEntries[matchedEntries.length - 1]
      const uniqueSpeakers = [...new Set(matchedEntries.map((e) => e.speaker))]

      return {
        text: chunk.text.replace(/\[\[\d+\]\]/g, '').trim(), // remove lineId markers
        metadata: {
          episode_title: inputData.metadata.episode_title,
          total_speakers: inputData.metadata.total_speakers,
          source: inputData.metadata.source,
          source_type: 'transcript',
          timestamp_start: firstEntry?.timestamp ?? '',
          timestamp_end: lastEntry?.timestamp ?? '',
          speakers_in_chunk: uniqueSpeakers,
          entries_count: matchedEntries.length,
          chunk_id: `${inputData.metadata.episode_title}_chunk_${index}_${firstEntry?.timestamp}_${lastEntry?.timestamp}`,
        },
      }
    })

    return { chunks: result }
  },
})

const processMultipleTranscriptsStep = createStep({
  id: 'process-multiple-transcripts',
  description: 'Process multiple transcript URLs and combine their chunks',
  inputSchema: z.object({
    urls: z.array(z.string()),
  }),
  outputSchema: z.object({
    allChunks: z.array(
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
    ),
    processedUrls: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const allChunks: any[] = []
    const processedUrls: string[] = []

    for (const url of inputData.urls) {
      try {
        console.log(`Processing transcript: ${url}`)

        // Fetch transcript
        const response = await fetch(url)
        const text = await response.text()

        // Parse transcript
        const parsed = JSON.parse(text)

        // Chunk transcript (reusing the logic from chunkTranscriptStep)
        const transcriptLines: string[] = []
        const entryMap: { [lineId: string]: TranscriptEntry } = {}

        parsed.transcript.forEach((entry: any, index: number) => {
          if (entry.text && entry.text.trim()) {
            const lineId = `[[${index}]]`
            const lineText = `${lineId} ${entry.text.trim()}`
            transcriptLines.push(lineText)
            entryMap[lineId] = entry
          }
        })

        const fullTranscriptText = transcriptLines.join('\n')

        const doc = new MDocument({
          docs: [
            {
              text: fullTranscriptText,
              metadata: {
                episode_title: parsed.metadata.episode_title,
                total_speakers: parsed.metadata.total_speakers,
                source: parsed.metadata.source,
              },
            },
          ],
          type: 'transcript',
        })

        // chunk document
        const chunks = await doc.chunk({
          strategy: 'sentence',
          maxSize: 600,
          overlap: 60,
        })

        // enrich each chunk with metadata
        const result: ChunkWithMetadata[] = chunks.map((chunk, index) => {
          const entryIndices = Array.from(
            chunk.text.matchAll(/\[\[(\d+)\]\]/g)
          ).map((match) => parseInt(match[1], 10))
          const uniqueIndices = Array.from(new Set(entryIndices)).sort(
            (a, b) => a - b
          )
          const matchedEntries = uniqueIndices.map((i) => parsed.transcript[i])

          const firstEntry = matchedEntries[0]
          const lastEntry = matchedEntries[matchedEntries.length - 1]
          const uniqueSpeakers = [
            ...new Set(matchedEntries.map((e: any) => e.speaker)),
          ]

          return {
            text: chunk.text.replace(/\[\[\d+\]\]/g, '').trim(),
            metadata: {
              episode_title: parsed.metadata.episode_title,
              total_speakers: parsed.metadata.total_speakers,
              source: parsed.metadata.source,
              source_type: 'transcript',
              timestamp_start: firstEntry?.timestamp ?? '',
              timestamp_end: lastEntry?.timestamp ?? '',
              speakers_in_chunk: uniqueSpeakers,
              entries_count: matchedEntries.length,
              chunk_id: `${parsed.metadata.episode_title}_chunk_${index}_${firstEntry?.timestamp}_${lastEntry?.timestamp}`,
            },
          }
        })

        // Add chunks to collection
        allChunks.push(...result)
        processedUrls.push(url)

        console.log(
          `Successfully processed transcript: ${url} (${result.length} chunks)`
        )
      } catch (error) {
        console.error(`Failed to process transcript ${url}:`, error)
        // Continue processing other transcripts even if one fails
      }
    }

    console.log(
      `Total chunks processed: ${allChunks.length} from ${processedUrls.length} transcripts`
    )
    return { allChunks, processedUrls }
  },
})

// embed step for single transcript (legacy)
const embedSingleTranscriptChunks = createStep({
  id: 'embed-single-transcript-chunks',
  description: 'Embed a single transcript chunks with their metadata',
  inputSchema: z.object({
    chunks: z.array(
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
    ),
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

// Embed step for multiple transcripts
const embedMultipleTranscriptChunks = createStep({
  id: 'embed-multiple-transcript-chunks',
  description: 'Embed multiple transcript chunks with their metadata',
  inputSchema: z.object({
    allChunks: z.array(
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
    ),
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

    // Check if index exists, if not create it
    try {
      await vectorStore.createIndex({
        indexName: 'transcripts',
        dimension: 1536,
      })
      console.log('Created new transcripts index')
    } catch (error) {
      // Index already exists, continue
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

// Legacy single transcript workflow (for backward compatibility)
const singleTranscriptWorkflow = createWorkflow({
  id: 'single-transcript-workflow',
  inputSchema: z.object({
    url: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
  steps: [
    fetchTranscriptStep,
    parseTranscriptStep,
    chunkTranscriptStep,
    embedSingleTranscriptChunks,
  ],
})
  .then(fetchTranscriptStep)
  .then(parseTranscriptStep)
  .then(chunkTranscriptStep)
  .then(embedSingleTranscriptChunks)
  .commit()

// New multi-transcript workflow
const transcriptsWorkflow = createWorkflow({
  id: 'transcripts-workflow',
  inputSchema: z.object({
    urls: z.array(z.string()).describe('Array of transcript URLs to process'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalChunks: z.number(),
    processedUrls: z.array(z.string()),
  }),
  steps: [processMultipleTranscriptsStep, embedMultipleTranscriptChunks],
})
  .then(processMultipleTranscriptsStep)
  .then(embedMultipleTranscriptChunks)
  .commit()

export { transcriptsWorkflow, singleTranscriptWorkflow }
