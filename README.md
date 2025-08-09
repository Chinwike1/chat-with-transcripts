# Chat with Transcripts

A RAG (Retrieval-Augmented Generation) application built with Mastra that allows users to query and chat with video transcript collections. The system processes transcript data, chunks it into searchable segments, and provides an intelligent agent for answering questions about the content.

![chrome_LO653ENfdR](https://github.com/user-attachments/assets/3bae304c-401b-4f99-ae4c-e55ffeb2cd3b)

## 🚀 Features

- **Two Workflow Options**: Choose between single transcript processing or multiple transcript batch processing
- **Transcript Processing**: Automatically chunks and embeds transcript data for efficient retrieval
- **Vector Search**: Semantic search through transcript content using OpenAI embeddings and PG Vector.
- **Multi-Modal Queries**: Search by content, speaker, timestamp, or episode
- **Intelligent Agent**: GPT-4 powered agent that provides contextual answers with source attribution
- **Memory**: Conversation memory for contextual follow-up questions
- **Incremental Updates**: Add new transcripts without deleting existing data

## 🗣️ Using the Transcript Agent

### 1. Choose Your Workflow

The system offers two workflow options for processing transcripts:

1. **Multiple Transcript Workflow**: Process multiple transcripts simultaneously for batch operations. This is ideal when you have several transcripts to analyze together.

2. **Single Transcript Workflow**: Process one transcript at a time. Useful for testing or when you only need to analyze a single transcript.

### 2. Run the Workflow (Data Processing)

First, process your transcript data to create the vector embeddings. Go to the Mastra Workflow UI and use any of the three sample transcripts in the `transcripts/` directory. They are also hosted here:

- [**Production Ready RAG Workshop**](https://gist.githubusercontent.com/Chinwike1/a745c2bcecd053915b8f8f0f38c8c63d/raw/c30ea27ef03c807969cf7fd2594364902359dc64/production_ready_rag_workshop_transcript.json)
- [**Evals with Mastra Workshop**](https://gist.githubusercontent.com/Chinwike1/558e517bf7bde5015926657c033790a8/raw/6970c2d48cd181c9b3dd760779a33c814fad8f8c/evals_with_mastra_workshop_transcript.json)
- [**Build Your First Agent Workshop**](https://gist.githubusercontent.com/Chinwike1/04d4ebcd0b9278f79af0fae3f530edc5/raw/2f374900b1984edbec9f834eb3dd8a56b91ac459/build_your_first_agent_mastra_workshop_transcript.json)

You can easily create your own transcripts using this [free tool](https://www.youtube-transcript.io/). Once generated, ask some AI to help format it to match the required schema.

**Expected Output**: The workflow will:

- Fetch all transcripts from the provided URLs
- Parse the JSON structure for each transcript
- Chunk the content into searchable segments with appropriate metadata like speakers and timestamps.
- Create embeddings and store them in PostgreSQL
- Return success status with total chunks processed and URLs processed

Now you're ready to query.

### 2. Query the Agent

Example prompts related to the transcripts provided earlier:

```txt
* What are some fun facts Abhi has shared about himself on the show?
* Which episode talks about RAG and who are the speakers?
* What did Shane say about the AI.Engineer conference?
* What is the Mastra.ai course?
```

**Expected Output**: The agent will:

- Search through the embedded transcript data
- Return relevant excerpts with metadata
- Provide speaker names, timestamps, and episode information
- Format the response with proper attribution

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
   cp env.example .env

   # .env
   # OpenAI API Key (required for embeddings and chat)
   OPENAI_API_KEY=your_openai_api_key_here
   POSTGRES_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name?sslmode=require
   ```

## Project Structure

```
chat-with-transcripts/
├── src/
│   └── mastra/
│       ├── agents/
│       │   └── chat-with-transcripts-agent.ts    # Main RAG agent
│       ├── tools/
│       │   └── transcript-search-tool.ts        # Search tools
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

## 🛠️ Development Commands

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

#### Adding New Transcripts

1. **Prepare your transcript data** in the expected JSON format:

   ```json
   {
     "metadata": {
       "episode_title": "Your Episode Title",
       "total_speakers": ["Speaker1", "Speaker2"],
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

3. **Run the workflow** with your transcript URL

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

## 🆘 Support

For issues and questions:

- Check the troubleshooting section above
- Review the Mastra documentation
- Open an issue in the repository
