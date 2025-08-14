--> install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
--> Create trigger function to auto update search_vector whenever transcripts table is modified
-- create function to update search_vector column
CREATE OR REPLACE FUNCTION transcripts_vector_update() 
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.episode_title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.speakers, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- create trigger to automatically update search vector
CREATE TRIGGER transcripts_vector_update
  BEFORE INSERT OR UPDATE ON transcripts
  FOR EACH ROW EXECUTE FUNCTION transcripts_vector_update();

-- populate existing records (if any)
UPDATE transcripts SET search_vector =
  setweight(to_tsvector('english', COALESCE(episode_title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(speakers, ' '), '')), 'C');