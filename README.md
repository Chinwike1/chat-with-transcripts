# Chat with Transcripts

A Retrieval-Augmented Generation (RAG) application powered by Mastra, designed for interactive querying and conversation over collections of video transcripts. The agent is equipped with tools to perform both semantic searches (vector search) and PostgreSQL's full-text search (`ts_vector`), enabling efficient exploration, summarization, and extraction of insights from large sets of transcript data.

![Chat with Transcripts Agent Demo](https://www.dropbox.com/paper/ep/redirect/image?url=https%3A%2F%2Fpaper-attachments.dropboxusercontent.com%2Fs_ABA110A11EEDC30AD5A9F813D196B222C40EE0BE02A835886D6CEF8966404F96_1754753039864_image.png&hmac=Zu%2BNAv3Kjp9xlk4TAjOk8M9hCz%2BBM9%2FYGj50FukHYas%3D&width=1490)

## 🚀 Features

- **Transcript Processing**: Transcript data is fetched, chunked and stored into a Postgres database.
- **Retrieval Process**: The agent is provided with tools to perform both semantic searches (vector search) and PG's full text search (`ts_vector`).
- **Vector Search**: Semantic search through transcript content using OpenAI embeddings and PG Vector.
- **Multi-Modal Queries**: Search transcript data by content, speaker, or episode.
- **Intelligent Agent**: GPT-4 powered agent that provides contextual answers with source attribution
- **Memory**: Conversation memory for contextual follow-up questions

## 🗣️ Using the Transcript Agent

### 1 Data Processing Workflow

Use the **Process Transcript Workflow** to store, chunk and embed your transcripts. This process expects url(s) pointing to transcript json data. Go to the Mastra Workflow UI and use any of the three sample transcripts in the `transcripts/` directory. They are also hosted here:

- [**Production Ready RAG Workshop**](https://gist.githubusercontent.com/Chinwike1/a745c2bcecd053915b8f8f0f38c8c63d/raw/12bfbd5dace621951e514110cbcab52a76d7788b/production_ready_rag_workshop_transcript.json)
- [**Evals with Mastra Workshop**](https://gist.githubusercontent.com/Chinwike1/558e517bf7bde5015926657c033790a8/raw/ef83a33105bcca77f550dc93d2538f5922543202/evals_with_mastra_workshop_transcript.json)
- [**Build Your First Agent Workshop**](https://gist.githubusercontent.com/Chinwike1/04d4ebcd0b9278f79af0fae3f530edc5/raw/fc3aff92186780e0de7c83e690153ae685fcad25/build_your_first_agent_mastra_workshop_transcript.json)

Ideally the transcript retreival processes should be done programmatically but you can manually create your own transcripts using this [tool](https://www.youtube-transcript.io/) and asking Claude to format it - my prompt:

```txt
i want you to preprocess transcript text data in JSON. You are to identify speaker(s) based on context through out the entire conversation. look out for segments where introductions are made or names are mentioned and use that to determine how many speakers are in the conversation and differentiate each speaker.
Example scenario: One speaker is asking another speaker a question and says their name:
---
02:30 Terrence, I feel like the conversation of the hour is you. I'mma let you take it away, man. Weekend recap. We saw the
02:38 post on IG. The title of this pod will say Terrence got engaged.
02:45 take it away, man. Y'all know for the last two weeks, I feel like I've been in a dog house a
02:51 little bit, but it's been purposeful. I feel like I've been kind of trying a little bit of a forecast,

The first speaker here calls out another speaker's name (Terrence), cheering him to talk about a topic. it's not directly obvious but the second speaker starts at "Y'all" on this line:
02:45 take it away, man. Y'all know for the last two weeks, I feel like I've been in a dog house a

Your job is to use your understanding of the English language to look for cases like these where a speaker identifies themselves. You should return a new transcript that then clearly identifies the speaker beside the timestamp: Specify all the name you found as metadata at the top of each output/transcript:
"metadata": {
    "speakers": ["John"],
  },

I'll be sending the transcripts in chunks. Are you ready?
```

**Expected Output**: The workflow will:

- Fetch all transcripts from the provided URLs
- Parse the JSON structure for each transcript
- Summarize and store the transcripts in the DB
- Chunk the content into searchable segments with appropriate metadata like speakers and timestamps.
- Create embeddings and store them in PGVector

Now you're ready to query.

### 2. Query the Agent

Example prompts related to the transcripts provided earlier:

```txt
* What are some fun facts Abhi has shared about himself on the show?
* What are Shane's comments about RAG?
* What episode talked about the AI.Engineer conference?
* What is the Mastra.ai course?
```

**Expected Output**: The agent will:

- Search through transcript data with full text search and fall back to semantic (vector) search
- Return relevant excerpts with metadata
- Provide speaker names, timestamps, and episode information
- Format the response with proper attribution
-

### Tools Overview

The agent uses the following tools for retrieval and search:

- **transcriptSearchTool**: Semantic search through transcript content (returns transcript chunks with metadata)
- **searchEpisodesByTitle**: Full-text search on episode titles/content using a query string
- **findEpisodesBySpeaker**: Find all episodes with a specific speaker
- **searchEpisodesBySpeakerAndTitle**: Combined search by speaker and topic/title
- **getEpisodeStats**: Get general statistics about the episodes (total count, top speakers)

Each tool is designed for a specific type of query, enabling both deep semantic retrieval and fast metadata search.

## Prerequisites

- **Node.js**: Version 20.9.0 or higher
- **PostgreSQL**: Database with pgvector extension enabled
- **OpenAI API Key**: For embeddings and chat completions
- **pnpm**: Package manager (recommended)

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Chinwike1/chat-with-transcripts
   cd chat-with-transcripts
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```bash
   mv env.example .env
   ```

   ```bash
   # .env
   # OpenAI API Key (required for embeddings and chat)
   OPENAI_API_KEY=your_openai_api_key_here
   POSTGRES_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name
   ```

4. **Set up the database schema and triggers**
   To Run the following commands to initialize your database schema and enable full text search with the `/src/db/migrations/0000_setup_migration.sql` file:

   ```bash
   pnpm db:push
   pnpm db:migrate
   ```

   This will create the necessary tables and a trigger for automatic PostgreSQL full text search vectors (ts_vector) used by the episode info tools.

## Project Structure

```
chat-with-transcripts/
├── src/
│   └── mastra/
│       ├── agents/
│       │   └── chat-with-transcripts-agent.ts    # Main RAG agent
│       ├── tools/
│       │   └── transcript-search-tool.ts        # Search tools
            └── episode-info-tool.ts             # Search tools
│       ├── workflows/
│       │   └── transcripts-workflow.ts          # Data processing workflow
│       └── index.ts                             # Mastra configuration
├── transcripts/                                 # Sample transcript data
│   ├── build_your_first_agent.json
│   ├── evals_with_mastra.json
│   └── production_ready_rag.json
├── types.ts                                     # TypeScript type definitions
└── package.json
```

## ♻️ Retrieval-Augmented Generation (RAG)

This project performs RAG using **two retrieval styles**:

- **PostgreSQL Full Text Search**: Fast keyword/topic search over episode metadata using PostgreSQL's `ts_vector`.
- **Vector Embeddings**: Semantic search over transcript chunks using OpenAI embeddings and pgvector.

## �🛠️ Development Commands

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm tsc --noEmit
```

## Customization

### Adding New Transcripts

1. **Prepare your transcript data** in the expected JSON format:

   ```json
   {
     "metadata": {
       "episode_title": "Your Episode Title",
       "speakers": ["Speaker1", "Speaker2"],
       "source": "source_url_or_description"
     },
     "transcript": [
       {
         "timestamp": "00:00:00",
         "speaker": "Speaker1",
         "text": "Transcript content..."
       }
     ]
   }
   ```

2. **Host the transcript** (GitHub Gist, S3, or your preferred hosting)

3. **Run the workflow** with your transcript URL(s)

### Modifying Search Behavior

- **Chunking Strategy**: Modify `chunkTranscriptStep` in `transcripts-workflow.ts`
- **Search Parameters**: Adjust `topK` values in search tools
- **Agent Instructions**: Update the agent's instructions in `chat-with-transcripts-agent.ts`

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection Error**:

   - Verify your connection string format
   - Ensure pgvector extension is installed
   - Check database permissions

2. **OpenAI API Errors**:

   - Verify your API key is correct
   - Check your OpenAI account credits
   - Ensure the API key has the necessary permissions

3. **Workflow Processing Errors**:
   - Check the transcript URL is accessible
   - Verify the JSON format matches the expected schema
   - Review the console logs for detailed error messages

---

For issues and questions:

- Check the troubleshooting section above
- Review the Mastra documentation
- Open an issue in the repository
