// Talks only to the Ollama server on the user's machine.
export async function listModels(url) {
  const r = await fetch(`${url}/api/tags`);
  if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
  return (await r.json()).models.map(m => m.name);
}
// num_gpu = how many model layers to put on the GPU. 999 means "all of them", so Ollama
// does not quietly fall back to the CPU. keep_alive keeps the model loaded so gpuWarning can inspect it.
export async function generate(url, model, prompt, signal, forceGpu = true) {
  if (!model) throw new Error('Choose a model in Settings first.');
  const body = { model, prompt, stream: false, keep_alive: '5m' };
  if (forceGpu) body.options = { num_gpu: 999 };
  const r = await fetch(`${url}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
  });
  if (!r.ok) throw new Error(`Ollama returned ${r.status}` + (forceGpu ? ' (if the model does not fit in GPU memory, try a smaller model or turn off "Force GPU" in Settings)' : ''));
  return (await r.json()).response;
}
export function summarize(url, model, docs, forceGpu = true, signal) {
  const body = docs.map(d => `## ${d.name}\n${d.text}`).join('\n\n---\n\n');
  const prompt = `Summarize the following notes in clear Markdown. Use headings and bullet points, and note each source file.\n\n${body}`;
  return generate(url, model, prompt, signal, forceGpu);
}
// Asks Ollama where the loaded model really lives. Returns '' when it is fully on the GPU,
// otherwise a short warning. (Ollama cannot be forced onto a GPU that is missing or too small.)
export async function gpuWarning(url, model) {
  try {
    const r = await fetch(`${url}/api/ps`);
    if (!r.ok) return '';
    const m = (await r.json()).models?.find(x => x.name === model || x.model === model || x.name?.startsWith(model + ':'));
    if (!m || !m.size) return '';
    const pct = Math.round(((m.size_vram || 0) / m.size) * 100);
    if (pct >= 100) return '';
    return pct === 0
      ? 'The model ran entirely on the CPU. Ollama did not find a usable GPU. Check your GPU drivers (NVIDIA CUDA or AMD ROCm) and run "ollama ps" to confirm.'
      : `Only ${pct}% of the model fit in GPU memory; the rest ran on the CPU. Use a smaller or more compressed model to run fully on the GPU.`;
  } catch { return ''; }
}