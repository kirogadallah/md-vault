
# Markdown Vault

Run a local static server (ES modules do not load from file://):
    python3 -m http.server 8000      # then open http://localhost:8000
Use Chrome, Edge or Brave (File System Access API).
Ollama: start with OLLAMA_ORIGINS=http://localhost:8000 ollama serve
Versions are stored in <vault></vault>/.versions/<note></note>/<timestamp></timestamp>.txt
Telegram: paste the bot token (from @BotFather) in Settings, then message the bot once; that chat becomes the only one allowed. Send text or /note <text></text> to save into <vault></vault>/Telegram/; /list lists notes. Needs internet; runs only while the app is open. /sum "topic" asks Ollama for a summary and saves it as <vault></vault>/summaries/<topic></topic>.md (needs Ollama running and a model chosen in Settings).
The AI (sparkle) button summarizes the ticked notes and saves the result as a new note in <vault></vault>/summaries/. "Force AI to run on the GPU" in Settings asks Ollama to offload all layers to the GPU and warns if it still ran on the CPU.
