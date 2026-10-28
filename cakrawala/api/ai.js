// POST /api/ai {messages:[{role,content}], context?:string} -> {text}. Kunci API tak pernah dikirim ke browser.
const { readBody, send } = require('./_lib');
const { load } = require('./store');
const PRESETS = { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1',
                  deepseek: 'https://api.deepseek.com/v1', ollama: 'http://localhost:11434/v1' };
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const { messages = [], context = '' } = await readBody(req);
    const ai = load().settings.ai;
    if (!ai.apiKey && ai.provider !== 'ollama') return send(res, 400, { error: 'Kunci API belum diisi. Buka Settings > AI.' });
    const system = ai.system + (context ? '\n\nKONTEKS TERMINAL (data saat ini):\n' + context : '');
    const msgs = messages.filter(m => m && m.content).slice(-30).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
    let text, usage;
    if (ai.provider === 'anthropic') {
      const r = await fetch((ai.baseUrl || 'https://api.anthropic.com') + '/v1/messages', { method: 'POST',
        headers: { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: ai.model, max_tokens: +ai.maxTokens || 1500, temperature: +ai.temperature, system, messages: msgs }), signal: AbortSignal.timeout(90000) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'anthropic ' + r.status);
      text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n'); usage = j.usage;
    } else {
      const base = ai.baseUrl || PRESETS[ai.provider];
      if (!base) throw new Error('Base URL belum diisi untuk provider kustom.');
      const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST',
        headers: { Authorization: 'Bearer ' + (ai.apiKey || 'x'), 'content-type': 'application/json' },
        body: JSON.stringify({ model: ai.model, max_tokens: +ai.maxTokens || 1500, temperature: +ai.temperature, messages: [{ role: 'system', content: system }, ...msgs] }), signal: AbortSignal.timeout(90000) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'provider ' + r.status);
      text = j.choices && j.choices[0] && j.choices[0].message.content; usage = j.usage;
    }
    send(res, 200, { text: text || '(kosong)', usage });
  } catch (e) { send(res, 502, { error: /timeout|aborted/i.test(e.message) ? 'Penyedia AI tidak membalas dalam 90 detik (server mereka sedang lambat atau down). Coba lagi nanti atau ganti model/provider di Settings.' : e.message }); }
};
