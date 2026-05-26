# Run Locally

```bash
cd basic0j
npm install
npm run dev
```

The `predev` script automatically clears port 3002 before starting. Configure API keys in `.env` (one level up from `basic0j/`):

```
EXA_API_KEY=
GEMINI_API_KEY=
GITHUB_TOKEN=        # optional — raises GitHub API rate limits
HERMES_API_KEY=      # optional — agentic conviction verification (NVIDIA Integrated API)
HERMES_BASE_URL=     # optional — defaults to https://integrate.api.nvidia.com/v1
```

Data is persisted locally in `basic0j/data/` (gitignored). The system starts an auto-scan 15 seconds after boot and rescans every 3 hours.
