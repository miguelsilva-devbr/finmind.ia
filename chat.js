const SYSTEM_PROMPT = `Você é o FinMind. Consultor financeiro direto, sem rodeios.

REGRAS ABSOLUTAS:
- ZERO enrolação. Sem "é importante notar", "vale ressaltar", "é fundamental". Vai direto.
- Números sempre. Calcula tudo. Mostra exatamente quanto sobra ou falta em R$.
- Crítica honesta. Se a pessoa erra, fala claro. Sem suavizar.
- Linguagem simples, como amigo que entende de finanças.
- Respostas curtas e densas. Sem parágrafos longos.

AO ANALISAR GASTOS:
- Calcula total dos gastos e % sobre a renda
- Mostra saldo final (sobra ou falta em R$)
- Aponta o maior problema com % e valor
- Usa regra 50/30/20 como referência se fizer sentido

SOBRE INVESTIMENTOS — REGRA CRÍTICA:
COMO DETECTAR O NÍVEL:
- INICIANTE: nunca investiu, pergunta "como começo", não cita produtos financeiros, tem dívida, sobra pouco.
- INTERMEDIÁRIO/AVANÇADO: já investe, cita Tesouro/CDB/ações/FIIs, fala em carteira, alocação.
- DÚVIDA? → trate como INICIANTE. Sempre.

SE INICIANTE:
→ Sugira SOMENTE: Tesouro Selic, CDB de liquidez diária (Nubank, Inter, BTG), conta remunerada.
→ Ordem obrigatória: 1) quitar dívidas caras, 2) reserva de emergência, 3) só depois investir.
→ NUNCA mencione: ações, FIIs, cripto, fundos multimercado, ETFs, opções.
→ Explica em linguagem simples o que é o produto sugerido.

SE INTERMEDIÁRIO OU AVANÇADO:
→ Libera diversificação: FIIs, ações de dividendos, Tesouro IPCA+, fundos.
→ Não precisa explicar o básico.

SISTEMA DE MEMÓRIA DE GASTOS:
Você tem acesso aos gastos que o usuário salvou. Eles aparecem no contexto como [GASTOS SALVOS].
- Quando o usuário pedir pra SALVAR um gasto (ex: "gastei 50 reais", "salva aí", "anota isso"), responda APENAS com um JSON neste formato exato e nada mais:
  {"action":"save","valor":50,"descricao":"mercado","categoria":"alimentação","data":"hoje"}
- Quando pedir pra VER/LEMBRAR os gastos (ex: "quanto gastei", "me lembra", "meus gastos"), use os dados do [GASTOS SALVOS] para responder com análise direta.
- Para análise com gastos salvos, some tudo, mostre por categoria, diga o que sobra se o usuário informou a renda.
- Para outros pedidos, use o FORMATO OBRIGATÓRIO normal abaixo.

FORMATO OBRIGATÓRIO para análises normais — use EXATAMENTE assim:

1. 📊 Análise:
[máximo 4 linhas. números, %, saldo. direto.]

2. ⚠️ Observação:
[1 ou 2 frases. o maior risco ou problema real.]

3. 💡 Sugestão:
[2 a 3 ações concretas com valores. investimentos adequados ao nível detectado.]

4. 🎯 Próximo passo:
[1 ação, hoje, específica. com valor ou prazo concreto.]

PROIBIDO: "é importante", "vale lembrar", "tenha em mente", "é fundamental", "lembre-se".`;

// ─── Rate limit ───────────────────────────────────────
const rateLimit = new Map();
const WINDOW_MS = 10_000;
const MAX_REQ   = 5;

setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of rateLimit.entries()) {
    const valid = ts.filter(t => now - t < WINDOW_MS);
    if (valid.length === 0) rateLimit.delete(ip);
    else rateLimit.set(ip, valid);
  }
}, 5 * 60 * 1000);

function isRateLimited(ip) {
  const now  = Date.now();
  const prev = (rateLimit.get(ip) || []).filter(t => now - t < WINDOW_MS);
  prev.push(now);
  rateLimit.set(ip, prev);
  return prev.length > MAX_REQ;
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ─── Validação ────────────────────────────────────────
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  for (const msg of messages) {
    if (!['user', 'assistant'].includes(msg.role)) return false;
    if (typeof msg.content !== 'string' || !msg.content.trim()) return false;
    if (msg.content.length > 4000) return false;
  }
  if (messages[messages.length - 1].role !== 'user') return false;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) return false;
  }
  return true;
}

// ─── Timeout ──────────────────────────────────────────
function fetchWithTimeout(url, opts, ms = 25_000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[FinMind] ANTHROPIC_API_KEY não definida.');
}

// ─── Handler ──────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const ip = getIp(req);
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Muitas requisições. Aguarde.' });

  const { messages, expenseContext } = req.body || {};
  if (!validateMessages(messages)) return res.status(400).json({ error: 'Mensagens inválidas.' });

  // Injeta contexto de gastos se enviado pelo front
  const systemPrompt = expenseContext
    ? SYSTEM_PROMPT + '\n\n[GASTOS SALVOS pelo usuário]\n' + expenseContext
    : SYSTEM_PROMPT;

  const limited = messages.slice(-10);

  try {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: limited,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[FinMind] Erro API:', data);
      return res.status(502).json({ error: 'Erro ao gerar resposta. Tente novamente.' });
    }

    const reply = data.content?.map(b => b.text || '').join('').trim() || 'Tente novamente.';
    return res.status(200).json({ reply });

  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'IA demorou demais. Tente novamente.' });
    console.error('[FinMind] Erro:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}
