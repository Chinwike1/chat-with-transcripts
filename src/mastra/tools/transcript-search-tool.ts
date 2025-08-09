import { openai } from '@ai-sdk/openai'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const transcriptSearchTool = createTool({
  id: 'transcript-search',
  description:
    'Search through a collection of video transcripts for relevant information. Returns text content with metadata including speaker names and timestamps.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('The search query to find relevant transcript content'),
  }),
  execute: async ({ context, mastra }) => {
    if (!mastra) throw new Error('Mastra instance not available')

    const vectorStore = mastra.getVector('pg')

    // create embedding for user query
    const embeddingResult = await openai
      .embedding('text-embedding-3-small')
      .doEmbed({ values: [context.query] })

    // search for relevant content
    const results = await vectorStore.query({
      indexName: 'transcripts',
      queryVector: embeddingResult.embeddings[0],
      topK: 15,
      includeVector: false,
    })

    // format results with metadata
    const formattedResults = results.map((result) => ({
      text: result.metadata?.text || '',
      timestamp_start: result.metadata?.timestamp_start || '',
      timestamp_end: result.metadata?.timestamp_end || '',
      speakers_in_chunk: result.metadata?.speakers_in_chunk || [],
      episode_title: result.metadata?.episode_title || '',
      score: result.score,
    }))

    return {
      query: context.query,
      relevantContext: formattedResults.map((r) => r.text).join('\n\n'),
      sources: formattedResults,
    }
  },
})

export const speakerSearchTool = createTool({
  id: 'speaker-search',
  description:
    'Search for content by specific speaker names in the transcripts',
  inputSchema: z.object({
    speaker: z.string().describe('The name of the speaker to search for'),
    query: z
      .string()
      .optional()
      .describe('Optional search query to filter speaker content'),
  }),
  execute: async ({ context, mastra }) => {
    if (!mastra) throw new Error('Mastra instance not available')

    const vectorStore = mastra.getVector('pg')

    // filtered search for content by speaker
    const embeddingResult = await openai
      .embedding('text-embedding-3-small')
      .doEmbed({ values: [context.query || context.speaker] })

    const results = await vectorStore.query({
      indexName: 'transcripts',
      queryVector: embeddingResult.embeddings[0],
      topK: 15,
      filter: {
        speakers_in_chunk: context.speaker,
      },
    })

    return {
      speaker: context.speaker,
      results: results.map((result) => ({
        text: result.metadata?.text || '',
        timestamp_start: result.metadata?.timestamp_start || '',
        timestamp_end: result.metadata?.timestamp_end || '',
        speakers_in_chunk: result.metadata?.speakers_in_chunk || [],
        episode_title: result.metadata?.episode_title || '',
        score: result.score,
      })),
    }
  },
})
