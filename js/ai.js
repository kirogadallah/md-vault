// Talks only to the Ollama server on the user's machine.
export async function listModels(url) {
  const r = await fetch(`${url}/api/tags`);
  if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
  return (await r.json()).models.map(m => m.name);
}
export async function summarize(url, model, docs) {
  if (!model) throw new Error('Choose a model in Settings first.');
  const body = docs.map(d => `## ${d.name}\n${d.text}`).join('\n\n---\n\n');
  const prompt = `Summarize the following notes in clear Markdown. Use headings and bullet points, and note each source file.\n\n${body}`;
  const r = await fetch(`${url}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false })
  });
  if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
  return (await r.json()).response;
}
