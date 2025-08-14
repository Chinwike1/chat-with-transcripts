import { MDocument } from '@mastra/rag'
import { ChunkWithMetadata, TranscriptData, TranscriptEntry } from '../types'

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

/**
 * Reusable helper function for chunking a single transcript
 */
export const chunkSingleTranscript = async (
  transcriptData: TranscriptData
): Promise<ChunkWithMetadata[]> => {
  // we use a [[lineId]] marker ( like [[0]], [[1]] ) to uniquely tag each transcript entry in the chunked text, so we can easily map chunks back to their original entries and metadata.
  const transcriptLines: string[] = []
  const entryMap: { [lineId: string]: TranscriptEntry } = {}

  transcriptData.transcript.forEach((entry: any, index: number) => {
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

  // chunk document
  const chunks = await doc.chunk({
    strategy: 'sentence',
    maxSize: 600,
    overlap: 60,
  })

  // enrich each chunk with metadata
  const result: ChunkWithMetadata[] = chunks.map((chunk, index) => {
    const entryIndices = Array.from(chunk.text.matchAll(/\[\[(\d+)\]\]/g)).map(
      (match) => parseInt(match[1], 10)
    )
    const uniqueIndices = Array.from(new Set(entryIndices)).sort(
      (a, b) => a - b
    )
    const matchedEntries = uniqueIndices.map(
      (i) => transcriptData.transcript[i]
    )

    const firstEntry = matchedEntries[0]
    const lastEntry = matchedEntries[matchedEntries.length - 1]
    const uniqueSpeakers = [
      ...new Set(matchedEntries.map((e: any) => e.speaker)),
    ]

    return {
      text: chunk.text.replace(/\[\[\d+\]\]/g, '').trim(),
      metadata: {
        episode_title: transcriptData.metadata.episode_title,
        speakers: transcriptData.metadata.speakers,
        source: transcriptData.metadata.source,
        source_type: 'transcript',
        timestamp_start: firstEntry?.timestamp ?? '',
        timestamp_end: lastEntry?.timestamp ?? '',
        speakers_in_chunk: uniqueSpeakers,
        entries_count: matchedEntries.length,
        chunk_id: `${transcriptData.metadata.episode_title}_chunk_${index}_${firstEntry?.timestamp}_${lastEntry?.timestamp}`,
      },
    }
  })

  return result
}
