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
      indexName: 'transcript_embeddings',
      queryVector: embeddingResult.embeddings[0],
      topK: 12,
      includeVector: false,
    })

    // format results with metadata
    const formattedResults = results.map((result) => ({
      text: result.metadata?.text || '',
      timestamp_start: result.metadata?.timestamp_start || '',
      timestamp_end: result.metadata?.timestamp_end || '',
      speakers_in_chunk: result.metadata?.speakers_in_chunk || [],
      episode_title: result.metadata?.episode_title || '',
      source: result.metadata?.source || '',
      score: result.score,
    }))

    return {
      query: context.query,
      relevantContext: formattedResults.map((r) => r.text).join('\n\n'),
      sources: formattedResults,
    }
  },
})
