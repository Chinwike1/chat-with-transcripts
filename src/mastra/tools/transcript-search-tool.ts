import { openai } from '@ai-sdk/openai'
import { createVectorQueryTool } from '@mastra/rag'
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
      topK: 10,
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

export const timestampSearchTool = createTool({
  id: 'timestamp-search',
  description:
    'Search for content within specific time ranges in the transcripts',
  inputSchema: z.object({
    start_time: z
      .string()
      .optional()
      .describe('Start timestamp (format: MM:SS)'),
    end_time: z.string().optional().describe('End timestamp (format: MM:SS)'),
    episode_title: z
      .string()
      .optional()
      .describe('Optional episode title to filter by'),
  }),
  execute: async ({ context, mastra }) => {
    if (!mastra) throw new Error('Mastra instance not available')

    const vectorStore = mastra.getVector('pg')

    // create filter based on provided timestamps
    const filter: any = {}

    if (context.episode_title) {
      filter.episode_title = context.episode_title
    }

    if (context.start_time || context.end_time) {
      filter.timestamp_start = {}
      if (context.start_time) {
        filter.timestamp_start.$gte = context.start_time
      }
      if (context.end_time) {
        filter.timestamp_start.$lte = context.end_time
      }
    }

    const embeddingResult = await openai
      .embedding('text-embedding-3-small')
      .doEmbed({ values: ['transcript content'] })
    const results = await vectorStore.query({
      indexName: 'transcripts',
      queryVector: embeddingResult.embeddings[0],
      topK: 20,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    })

    return {
      timeRange: {
        start: context.start_time || 'beginning',
        end: context.end_time || 'end',
      },
      episode: context.episode_title || 'all episodes',
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

export const episodeInfoTool = createTool({
  id: 'episode-info',
  description: 'Get information about available episodes and their speakers',
  inputSchema: z.object({
    episode_title: z
      .string()
      .optional()
      .describe('Optional specific episode title'),
  }),
  execute: async ({ context, mastra }) => {
    if (!mastra) throw new Error('Mastra instance not available')

    const vectorStore = mastra.getVector('pg')

    // get all episodes
    const embeddingResult = await openai
      .embedding('text-embedding-3-small')
      .doEmbed({ values: ['episode information'] })
    const results = await vectorStore.query({
      indexName: 'transcripts',
      queryVector: embeddingResult.embeddings[0],
      topK: 100,
      filter: context.episode_title
        ? { episode_title: context.episode_title }
        : undefined,
    })

    // extract unique episodes and speakers
    const episodes = new Map()

    results.forEach((result) => {
      const episodeTitle = result.metadata?.episode_title || 'Unknown'
      const speakers = result.metadata?.total_speakers || []
      const source = result.metadata?.source || ''

      if (!episodes.has(episodeTitle)) {
        episodes.set(episodeTitle, {
          title: episodeTitle,
          speakers: speakers,
          source: source,
          chunks_count: 0,
        })
      }
      episodes.get(episodeTitle).chunks_count++
    })

    return {
      episodes: Array.from(episodes.values()),
      total_episodes: episodes.size,
    }
  },
})
