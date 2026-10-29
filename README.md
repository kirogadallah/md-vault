# Markdown Vault
Run a local static server (ES modules do not load from file://):
    python3 -m http.server 8000      # then open http://localhost:8000
Use Chrome, Edge or Brave (File System Access API).
Ollama: start with OLLAMA_ORIGINS=http://localhost:8000 ollama serve
Versions are stored in <vault>/.versions/<note>/<timestamp>.txt
Telegram: paste the bot token (from @BotFather) in Settings, then message the bot once; that chat becomes the only one allowed. Send text or /note <text> to save into <vault>/Telegram/; /list lists notes. Needs internet; runs only while the app is open.
