import { createTool } from '@mastra/core'
import { and, desc, sql } from 'drizzle-orm'
import { db, transcripts } from '../../db/schema'
import { z } from 'zod'

const episodeQuerySchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        episode_title: z.string(),
        speakers: z.array(z.string()),
        source: z.string(),
        relevanceScore: z.number(),
      })
    )
    .nullable(),
  query: z.string(),
  count: z.number(),
  message: z.string(),
})

const findEpisodesBySpeakerOutputSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        episodeTitle: z.string(),
        speakers: z.array(z.string()),
        sourceUrl: z.string(),
      })
    )
    .nullable(),
  speakerName: z.string(),
  count: z.number(),
  message: z.string(),
})

const searchEpisodesBySpeakerAndTitleOutputSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        episodeTitle: z.string(),
        speakers: z.array(z.string()),
        sourceUrl: z.string(),
        relevanceScore: z.number(),
      })
    )
    .nullable(),
  speakerName: z.string(),
  titleQuery: z.string(),
  count: z.number(),
  message: z.string(),
})

const getEpisodeStatsOutputSchema = z.object({
  totalEpisodes: z.number(),
  topSpeakers: z
    .array(
      z.object({
        name: z.string(),
        appearances: z.number(),
      })
    )
    .nullable(),
  message: z.string(),
})

export const searchEpisodesByTitle = createTool({
  id: 'search-transcript-by-title',
  description:
    'Full text search for transcript episodes by title or keywords in the title. Useful for finding specific episodes or topics.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('User query to find relevant transcript content'),
  }),
  outputSchema: episodeQuerySchema,
  execute: async ({ context }) => {
    const query = context.query

    try {
      const searchQuery = query
        .trim()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .join(' & ')

      // search and rank episodes relevant to user's query
      const results = await db
        .select({
          id: transcripts.id,
          episode_title: transcripts.episode_title,
          speakers: transcripts.speakers,
          source: transcripts.source,
          relevanceScore: sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${searchQuery}))`,
        })
        .from(transcripts)
        .where(
          sql`search_vector @@ websearch_to_tsquery('english', ${searchQuery})`
        )
        .orderBy(
          desc(
            sql`ts_rank(search_vector, websearch_to_tsquery('english', ${searchQuery}))`
          )
        )

      return {
        results,
        query,
        count: results.length,
        message: `Found ${results.length} episodes matching "${query}"`,
      }
    } catch (error) {
      return {
        results: null,
        query,
        count: 0,
        message: `Unknown error executing query: "${query}"`,
      }
    }
  },
})

export const findEpisodesBySpeaker = createTool({
  id: 'find-episodes-by-speaker',
  description:
    'Find all episodes where a specific person was a speaker. Use this for questions like "how many shows has X been on?" or "what episodes did X appear in?"',
  inputSchema: z.object({
    speakerName: z.string().describe('Name of the speaker to search for'),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum number of results to return'),
  }),
  outputSchema: findEpisodesBySpeakerOutputSchema,
  execute: async ({ context }) => {
    const { speakerName, limit } = context
    try {
      // use ILIKE for case-insensitive partial matching within the array
      const results = await db
        .select({
          id: transcripts.id,
          episodeTitle: transcripts.episode_title,
          speakers: transcripts.speakers,
          sourceUrl: transcripts.source,
        })
        .from(transcripts)
        .where(
          sql`EXISTS (
          SELECT 1 FROM unnest(speakers) AS speaker 
          WHERE speaker ILIKE ${`%${speakerName}%`}
        )`
        )

      const count = results.length

      return {
        results,
        speakerName,
        count,
        message: `${speakerName} appeared in ${count} episode${
          count !== 1 ? 's' : ''
        }`,
      }
    } catch (error) {
      return {
        results: null,
        speakerName,
        count: 0,
        message: `Error fetching episodes by "${speakerName}"`,
      }
    }
  },
})

export const searchEpisodesBySpeakerAndTitle = createTool({
  id: 'search-episodes-by-speaker-and-title',
  description:
    'Search for episodes by both speaker name and title/content keywords. Useful for complex queries.',
  inputSchema: z.object({
    speakerName: z.string().describe('Name of the speaker'),
    titleQuery: z.string().describe('Keywords to search in episode titles'),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe('Maximum number of results to return'),
  }),
  outputSchema: searchEpisodesBySpeakerAndTitleOutputSchema,
  execute: async ({ context }) => {
    const { speakerName, titleQuery, limit } = context
    try {
      const searchQuery = titleQuery
        .trim()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .join(' & ')

      const results = await db
        .select({
          id: transcripts.id,
          episodeTitle: transcripts.episode_title,
          speakers: transcripts.speakers,
          sourceUrl: transcripts.source,
          relevanceScore: sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${searchQuery}))`,
        })
        .from(transcripts)
        .where(
          and(
            sql`search_vector @@ websearch_to_tsquery('english', ${searchQuery})`,
            sql`EXISTS (
            SELECT 1 FROM unnest(speakers) AS speaker 
            WHERE speaker ILIKE ${`%${speakerName}%`}
          )`
          )
        )
        .orderBy(
          desc(
            sql`ts_rank(search_vector, websearch_to_tsquery('english', ${searchQuery}))`
          )
        )
        .limit(limit || 10)

      return {
        results,
        speakerName,
        titleQuery,
        count: results.length,
        message: `Found ${results.length} episodes with ${speakerName} matching "${titleQuery}"`,
      }
    } catch (error) {
      return {
        results: null,
        speakerName,
        titleQuery,
        count: 0,
        message: `Combined search failed. No results for episodes with ${speakerName} matching "${titleQuery}"`,
      }
    }
  },
})

export const getEpisodeStats = createTool({
  id: 'get-episode-stats',
  description:
    'Get general statistics about the episodes in show - total count and top speakers.',
  outputSchema: getEpisodeStatsOutputSchema,
  execute: async ({ context }) => {
    try {
      const count = await db
        .select({
          totalEpisodes: sql<number>`count(*)`,
        })
        .from(transcripts)

      let topSpeakers = null
      // get top speakers by appearance count
      const speakersQuery = await db.execute(sql`
          SELECT speaker_name, COUNT(*) as appearance_count
          FROM transcripts, unnest(speakers) AS speaker_name
          GROUP BY speaker_name
          ORDER BY appearance_count DESC
          LIMIT 10
        `)

      topSpeakers = speakersQuery.rows.map((row) => ({
        name: row.speaker_name as string,
        appearances: row.appearance_count as number,
      }))

      return {
        totalEpisodes: count[0].totalEpisodes,
        topSpeakers,
        message: `Database contains ${count[0].totalEpisodes} episodes`,
      }
    } catch (error) {
      return {
        totalEpisodes: 0,
        topSpeakers: null,
        message: 'Error querying episode statistics',
      }
    }
  },
})
