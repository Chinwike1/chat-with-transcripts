export interface ProcessedTranscript {
  timestamp: string
  speaker: string
  text: string
}
export interface SimpleTranscript {
  text: string
}

export interface TranscriptMetadata {
  episode_title: string
  speakers: string[]
  summary: string | null
  source: string
}

export interface TranscriptData {
  metadata: TranscriptMetadata
  transcript: ProcessedTranscript[] | SimpleTranscript
}

export interface ChunkWithMetadata {
  text: string
  metadata: {
    episode_title: string
    speakers: string[]
    source: string
    source_type: string
    timestamp_start: string
    timestamp_end: string
    speakers_in_chunk: string[]
    entries_count: number
    chunk_id: string
  }
}
