# Chat with Transcripts

A RAG (Retrieval-Augmented Generation) application built with Mastra that allows users to query and chat with video transcript collections. The system processes transcript data, chunks it into searchable segments, and provides an intelligent agent for answering questions about the content.

## 🚀 Features

- **Transcript Processing**: Automatically chunks and embeds transcript data for efficient retrieval
- **Vector Search**: Semantic search through transcript content using OpenAI embeddings
- **Multi-Modal Queries**: Search by content, speaker, timestamp, or episode
- **Intelligent Agent**: GPT-4 powered agent that provides contextual answers with source attribution
- **Memory**: Conversation memory for contextual follow-up questions
- **PostgreSQL Integration**: Robust vector storage with PostgreSQL and pgvector

## 📋 Prerequisites

- **Node.js**: Version 20.9.0 or higher
- **PostgreSQL**: Database with pgvector extension enabled
- **OpenAI API Key**: For embeddings and chat completions
- **pnpm**: Package manager (recommended)

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
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
   ```

## 🔑 API Keys & Configuration

### Required Environment Variables

Add the following to your `.env` file:

```env
# OpenAI API Key (required for embeddings and chat)
OPENAI_API_KEY=your_openai_api_key_here

# PostgreSQL Connection String (required for vector storage)
POSTGRES_CONNECTION_STRING=postgresql://username:password@localhost:5432/database_name?sslmode=require

# Optional: Custom OpenAI base URL (if using Azure OpenAI or other providers)
# OPENAI_BASE_URL=https://your-custom-endpoint.com/v1
```

### Getting API Keys

1. **OpenAI API Key**:

   - Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create a new API key
   - Ensure you have sufficient credits for embeddings and chat completions

2. **PostgreSQL Setup**:
   - Install PostgreSQL (version 12 or higher)
   - Install the pgvector extension:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - Create a database and user with appropriate permissions
   - Update the connection string in your `.env` file

## 🏗️ Project Structure

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

## 🧪 Testing Cycle

The recommended testing approach follows this sequence:

### 1. Run the Workflow (Data Processing)

First, process your transcript data to create the vector embeddings:

```bash
# Start the Mastra development server
pnpm dev

# Then enter your transcript from the Mastra Workflow UI
https://gist.githubusercontent.com/Chinwike1/a745c2bcecd053915b8f8f0f38c8c63d/raw/c30ea27ef03c807969cf7fd2594364902359dc64/production_ready_rag_workshop_transcript.json
```

**Expected Output**: The workflow will:

- Fetch the transcript from the URL
- Parse the JSON structure
- Chunk the content into searchable segments
- Create embeddings and store them in PostgreSQL
- Return a success message

### 2. Query the Agent

Once the workflow has processed the data, test the agent:

```bash
# Send a query to the agent
Ask the agent questions about your uploaded transcripts e.g "What are the key points about RAG implementation?"
```

**Expected Output**: The agent will:

- Search through the embedded transcript data
- Return relevant excerpts with metadata
- Provide speaker names, timestamps, and episode information
- Format the response with proper attribution

## 🔍 Available Search Tools

The agent has access to several specialized search tools:

1. General Transcript Search Tool

2. Speaker-Specific Search Tool

3. Timestamp-Based Search Tool

4. Episode Information Tool

## 📊 Sample Transcripts

The project includes three sample transcripts in the `transcripts/` directory:

- `build_your_first_agent.json` - Guide to building your first Mastra agent
- `evals_with_mastra.json` - Information about evaluation systems
- `production_ready_rag.json` - Production-ready RAG implementation workshop

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

## 🔧 Customization

### Adding New Transcripts

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

## 🐛 Troubleshooting

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
