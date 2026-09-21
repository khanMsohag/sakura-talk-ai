# Sakura Talk — Japanese Roleplay MVP

Mobile-first realtime Japanese role-play MVP based on the provided master specification.

## What works
- Sakura character and 8 scenarios
- N5–N1/Native level selector
- OpenAI Realtime WebRTC speech-to-speech path
- Semantic VAD, interruption support, input transcription, assistant transcript
- Natural correction instructions (recast first, brief correction when needed)
- Bengali help options
- End-session AI report using GPT-5.6 Luna
- No-key demo flow and local fallback report
- Mobile-first responsive UI

## Required environment variable
`OPENAI_API_KEY`

The standard API key is used only in server functions to mint an ephemeral Realtime client secret and to generate the report. It is never sent to the browser.

## Local preview
Any static server can preview the UI, but `/api/*` functions require a Vercel-compatible local runtime or deployment.

## Vercel
Deploy the project root and add `OPENAI_API_KEY` as a server-side environment variable for Preview and Production.
