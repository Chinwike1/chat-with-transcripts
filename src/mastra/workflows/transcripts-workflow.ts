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

const embedTranscriptChunks = createStep({
  id: 'embed-transcript-chunks',
  description: 'Embed the transcript chunks with their metadata',
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

const transcriptsWorkflow = createWorkflow({
  id: 'transcripts-workflow',
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
    embedTranscriptChunks,
  ],
})
  .then(fetchTranscriptStep)
  .then(parseTranscriptStep)
  .then(chunkTranscriptStep)
  .then(embedTranscriptChunks)
  .commit()

export { transcriptsWorkflow }
