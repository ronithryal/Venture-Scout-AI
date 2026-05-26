# Run Locally

```bash
cd basic0j
npm install
npm run dev
```

The `predev` script automatically clears port 3002 before starting.

Copy the env template and fill in your keys:

```bash
cp .env.example .env
```

Required keys: `EXA_API_KEY`, `GEMINI_API_KEY`. All others are optional — see `.env.example` for details.

Data is persisted locally in `basic0j/data/` (gitignored). The system starts an auto-scan 15 seconds after boot and rescans every 3 hours.
