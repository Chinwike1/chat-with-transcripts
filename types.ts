export interface TranscriptEntry {
  timestamp: string
  speaker: string
  text: string
}

export interface TranscriptMetadata {
  episode_title: string
  total_speakers: string[]
  source: string
}

export interface TranscriptData {
  metadata: TranscriptMetadata
  transcript: TranscriptEntry[]
}

export interface ChunkWithMetadata {
  text: string
  metadata: {
    episode_title: string
    total_speakers: string[]
    source: string
    source_type: string
    timestamp_start: string
    timestamp_end: string
    speakers_in_chunk: string[]
    entries_count: number
    chunk_id: string
  }
}
