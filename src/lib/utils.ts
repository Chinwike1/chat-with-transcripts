import { MDocument } from '@mastra/rag'
import {
  ChunkWithMetadata,
  TranscriptData,
  ProcessedTranscript,
  SimpleTranscript,
} from '../types'

/**
 * Helper function to fetch and parse a transcript.
 */
export const fetchAndParseTranscript = async (
  url: string
): Promise<TranscriptData> => {
  console.log('Fetching transcript from', url)
  const response = await fetch(url)
  const text = await response.text()
  const parsed = JSON.parse(text)
  return parsed as TranscriptData
}

export const fetchJsonTranscript = async (
  url: string
): Promise<TranscriptData> => {
  console.log('Fetching transcript from', url)
  const response = await fetch(url)
  const text = await response.text()
  const parsed = JSON.parse(text)
  return parsed as TranscriptData
}

const fetchYouTubeTranscript = async (url: string): Promise<TranscriptData> => {
  const { Innertube } = await import('youtubei.js')

  const youtube = await Innertube.create({
    lang: 'en',
    location: 'US',
    retrieve_player: false,
  })

  try {
    const info = await youtube.getInfo(url)
    const transcriptData = await info.getTranscript()

    const metadata = {
      episode_title: info.basic_info.title!,
      speakers: info.basic_info.author ? [info.basic_info.author] : [],
      summary: null,
      source: url,
    }
    const transcriptText =
      transcriptData?.transcript?.content?.body?.initial_segments.map(
        (segment: any) => segment.snippet.text
      ) as string[]

    return {
      metadata,
      transcript: {
        text: transcriptText.filter(Boolean).join(' '),
      },
    }
  } catch (error) {
    console.error('Error fetching transcript:', error)
    throw error
  }
}

export async function getVideoTranscript(videoUrl: string) {
  if (!videoUrl) throw new Error('No video URL provided')

  const isYouTube =
    videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')

  console.log('isYouTube:', isYouTube)

  const videoId = new URL(videoUrl).searchParams.get('v')

  try {
    if (!isYouTube) {
      const transcript = await fetchJsonTranscript(videoUrl)
      return transcript
    } else {
      const transcript = await fetchYouTubeTranscript(videoId || videoUrl)
      return transcript
    }
  } catch (err) {
    console.error('Error fetching transcript:', err)
  }
}

/**
 * Reusable helper function for chunking a single transcript
 */
export const chunkSingleTranscript = async (
  transcriptData: TranscriptData
): Promise<ChunkWithMetadata[]> => {
  const transcriptLines: string[] = []
  const entryMap: { [lineId: string]: ProcessedTranscript | SimpleTranscript } =
    {}

  // Normalize transcript into an array
  const transcriptArray = Array.isArray(transcriptData.transcript)
    ? transcriptData.transcript
    : [transcriptData.transcript]

  transcriptArray.forEach((entry, index) => {
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
          episode_title: transcriptData.metadata.episode_title,
          speakers: transcriptData.metadata.speakers,
          source: transcriptData.metadata.source,
        },
      },
    ],
    type: 'transcript',
  })

  const chunks = await doc.chunk({
    strategy: 'sentence',
    maxSize: 600,
    overlap: 60,
  })

  const result: ChunkWithMetadata[] = chunks.map((chunk, index) => {
    const entryIndices = Array.from(chunk.text.matchAll(/\[\[(\d+)\]\]/g)).map(
      (match) => parseInt(match[1], 10)
    )
    const uniqueIndices = Array.from(new Set(entryIndices)).sort(
      (a, b) => a - b
    )
    const matchedEntries = uniqueIndices.map((i) => transcriptArray[i])

    const firstEntry = matchedEntries[0]
    const lastEntry = matchedEntries[matchedEntries.length - 1]

    // Only include speakers/timestamps if they exist (ProcessedTranscript)
    const uniqueSpeakers = [
      ...new Set(
        matchedEntries
          .map((e: any) => e.speaker)
          .filter((s) => typeof s === 'string' && s.trim() !== '')
      ),
    ]

    return {
      text: chunk.text.replace(/\[\[\d+\]\]/g, '').trim(),
      metadata: {
        episode_title: transcriptData.metadata.episode_title,
        speakers: transcriptData.metadata.speakers,
        source: transcriptData.metadata.source,
        source_type: 'transcript',
        timestamp_start:
          'timestamp' in (firstEntry || {})
            ? (firstEntry as ProcessedTranscript).timestamp
            : '',
        timestamp_end:
          'timestamp' in (lastEntry || {})
            ? (lastEntry as ProcessedTranscript).timestamp
            : '',
        speakers_in_chunk: uniqueSpeakers,
        entries_count: matchedEntries.length,
        chunk_id: `${transcriptData.metadata.episode_title}_chunk_${index}_${
          (firstEntry as any)?.timestamp || ''
        }_${(lastEntry as any)?.timestamp || ''}`,
      },
    }
  })

  return result
}
