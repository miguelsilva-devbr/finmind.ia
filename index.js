import { useState, useRef, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════
// MEMÓRIA DE GASTOS (localStorage)
// ═══════════════════════════════════════════════════════
const MEM_KEY = 'finmind_gastos';

function loadExpenses() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY)) || []; } catch { return []; }
}
function saveExpenses(list) { localStorage.setItem(MEM_KEY, JSON.stringify(list)); }
function formatBRL(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function buildExpenseContext(list) {
  if (!list.length) return '';
  const lines = list.map(e => `- ${e.data} | ${e.categoria} | ${e.descricao} | ${formatBRL(e.valor)}`).join('\n');
  const total  = list.reduce((s, e) => s + Number(e.valor), 0);
  return `${lines}\nTotal: ${formatBRL(total)}`;
}
function tryParseSave(text) {
  try {
    const clean = text.trim().replace(/```json|```/g, '').trim();
    const obj = JSON.parse(clean);
    if (obj.action === 'save' && obj.valor) return obj;
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════
// PARSE DE SEÇÕES
// ═══════════════════════════════════════════════════════
const PATTERNS = [
  { key:'analise',    label:'📊 Análise',       re:/1\.\s*📊\s*Análise:([\s\S]*?)(?=2\.\s*⚠️|$)/ },
  { key:'observacao', label:'⚠️ Observação',    re:/2\.\s*⚠️\s*Observação:([\s\S]*?)(?=3\.\s*💡|$)/ },
  { key:'sugestao',   label:'💡 Sugestão',      re:/3\.\s*💡\s*Sugestão:([\s\S]*?)(?=4\.\s*🎯|$)/ },
  { key:'proximo',    label:'🎯 Próximo passo', re:/4\.\s*🎯\s*Próximo passo:([\s\S]*?)$/ },
];
function parseResponse(text) {
  const sections = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) sections.push({ key: p.key, label: p.label, content: m[1].trim() });
  }
  return sections.length >= 2 ? sections : null;
}

const SEC_STYLE = {
  analise:    { bg:'#081920', border:'rgba(45,212,191,.2)',  left:'#2dd4bf', glow:'rgba(45,212,191,.09)',  accent:'#2dd4bf' },
  observacao: { bg:'#1a0909', border:'rgba(248,113,113,.2)',left:'#f87171', glow:'rgba(248,113,113,.09)', accent:'#f87171' },
  sugestao:   { bg:'#071510', border:'rgba(74,222,128,.2)', left:'#4ade80', glow:'rgba(74,222,128,.09)',  accent:'#4ade80' },
  proximo:    { bg:'#09090f', border:'rgba(129,140,248,.2)',left:'#818cf8', glow:'rgba(129,140,248,.09)', accent:'#818cf8' },
};

// ═══════════════════════════════════════════════════════
// COMPONENTES
// ═══════════════════════════════════════════════════════
function TypingDots() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'12px 16px',
      background:'#0b1520', border:'1px solid #15263a', borderRadius:12, width:'fit-content' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#2dd4bf',
          animation:`tdot 1.2s ease-in-out ${i*.2}s infinite` }} />
      ))}
      <span style={{ fontSize:12, color:'#3d5166', marginLeft:4 }}>Calculando...</span>
    </div>
  );
}

function Sections({ sections }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%' }}>
      {sections.map(sec => {
        const s = SEC_STYLE[sec.key] || SEC_STYLE.analise;
        return (
          <div key={sec.key} style={{ background:s.bg, border:`1px solid ${s.border}`,
            borderLeft:`3px solid ${s.left}`, borderRadius:12, padding:'12px 15px',
            boxShadow:`0 0 22px ${s.glow}`, animation:'pop .28s ease' }}>
            <div style={{ fontSize:10, fontWeight:800, color:s.accent, textTransform:'uppercase',
              letterSpacing:1.3, marginBottom:6 }}>{sec.label}</div>
            <div style={{ fontSize:14, color:'#c8d8e8', lineHeight:1.75, whiteSpace:'pre-wrap',
              wordBreak:'break-word' }}>{sec.content}</div>
          </div>
        );
      })}
    </div>
  );
}

function SavedBubble({ item }) {
  return (
    <div style={{ background:'#071510', border:'1px solid rgba(74,222,128,.25)',
      borderLeft:'3px solid #4ade80', borderRadius:12, padding:'11px 15px', width:'100%',
      fontSize:13, color:'#a0e0b0', lineHeight:1.6,
      boxShadow:'0 0 18px rgba(74,222,128,.08)', animation:'pop .28s ease' }}>
      ✅ <strong style={{ color:'#4ade80' }}>Salvo!</strong>{' '}
      {item.descricao} — <strong>{formatBRL(item.valor)}</strong>
      <span style={{ color:'#3d5166', fontSize:12 }}> · {item.categoria}</span><br/>
      <span style={{ fontSize:12, color:'#3d5166' }}>
        Peça "me lembra meus gastos" quando quiser ver o resumo.
      </span>
    </div>
  );
}

function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display:'flex', justifyContent:'flex-end', animation:'pop .22s ease' }}>
        <div style={{ background:'linear-gradient(135deg,#0c5e59,#1a3a8a)',
          borderRadius:'16px 16px 4px 16px', padding:'11px 15px', maxWidth:'82%',
          fontSize:14, lineHeight:1.65, color:'#e8faf8',
          boxShadow:'0 2px 16px rgba(45,212,191,.14)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.savedItem) return (
    <div style={{ display:'flex', animation:'pop .22s ease' }}>
      <SavedBubble item={msg.savedItem} />
    </div>
  );
  const sections = parseResponse(msg.content);
  return (
    <div style={{ display:'flex', animation:'pop .22s ease' }}>
      {sections
        ? <Sections sections={sections} />
        : <div style={{ background:'#0b1520', border:'1px solid #15263a', borderRadius:12,
            padding:'12px 15px', fontSize:14, lineHeight:1.75, color:'#c8d8e8',
            whiteSpace:'pre-wrap', wordBreak:'break-word', width:'100%' }}>{msg.content}</div>
      }
    </div>
  );
}

// Painel de gastos salvos
function MemPanel({ expenses, onDelete, onClearAll, onAsk }) {
  const total = expenses.reduce((s, e) => s + Number(e.valor), 0);
  return (
    <div style={{ width:'100%', maxWidth:740, background:'#080e18',
      borderBottom:'1px solid #0f1923', padding:'14px 22px', animation:'slideDown .2s ease' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:800, color:'#2dd4bf',
          textTransform:'uppercase', letterSpacing:1 }}>📋 Gastos salvos</span>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onAsk} style={{ background:'transparent', border:'1px solid #15263a',
            borderRadius:6, padding:'3px 9px', color:'#3d5166', fontSize:11, cursor:'pointer',
            fontFamily:'inherit' }}
            onMouseEnter={e=>{e.target.style.borderColor='#2dd4bf';e.target.style.color='#2dd4bf';}}
            onMouseLeave={e=>{e.target.style.borderColor='#15263a';e.target.style.color='#3d5166';}}>
            💬 Analisar tudo
          </button>
          <button onClick={onClearAll} style={{ background:'transparent', border:'1px solid #15263a',
            borderRadius:6, padding:'3px 9px', color:'#3d5166', fontSize:11, cursor:'pointer',
            fontFamily:'inherit' }}
            onMouseEnter={e=>{e.target.style.borderColor='#f87171';e.target.style.color='#f87171';}}
            onMouseLeave={e=>{e.target.style.borderColor='#15263a';e.target.style.color='#3d5166';}}>
            🗑 Limpar tudo
          </button>
        </div>
      </div>

      {expenses.length === 0
        ? <div style={{ fontSize:13, color:'#3d5166', textAlign:'center', padding:'14px 0' }}>
            Nenhum gasto salvo ainda.
          </div>
        : <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflowY:'auto' }}>
            {expenses.map(e => (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10,
                background:'#0b1520', border:'1px solid #15263a', borderRadius:8, padding:'8px 12px' }}>
                <span style={{ fontSize:11, color:'#3d5166', minWidth:80 }}>{e.categoria}</span>
                <span style={{ flex:1, fontSize:13, color:'#dce9f5' }}>{e.descricao}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'#2dd4bf', minWidth:70, textAlign:'right' }}>
                  {formatBRL(e.valor)}
                </span>
                <span style={{ fontSize:10, color:'#3d5166', minWidth:44, textAlign:'right' }}>{e.data}</span>
                <button onClick={() => onDelete(e.id)} style={{ background:'transparent', border:'none',
                  color:'#3d5166', cursor:'pointer', fontSize:16, padding:'0 2px',
                  lineHeight:1, transition:'color .15s' }}
                  onMouseEnter={ev=>ev.target.style.color='#f87171'}
                  onMouseLeave={ev=>ev.target.style.color='#3d5166'}>×</button>
              </div>
            ))}
          </div>
      }

      {expenses.length > 0 && (
        <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #15263a',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#3d5166' }}>Total registrado</span>
          <span style={{ fontSize:14, fontWeight:800, color:'#2dd4bf' }}>{formatBRL(total)}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════
const QUICK = [
  { label:'💸 Analisar gastos',   sub:'Salário R$2.000 com despesas',  text:'Salário: R$2.000. Aluguel: R$700, Comida: R$500, Lazer: R$400, Transporte: R$200, Outros: R$150' },
  { label:'📌 Registrar gasto',   sub:'Salva um gasto para depois',     text:'Gastei R$50 hoje no mercado. Salva aí pra mim.' },
  { label:'🔍 Ver meus gastos',   sub:'Consulta o que foi salvo',       text:'Quanto eu gastei até agora? Me lembra tudo que salvei.' },
  { label:'💰 Quero investir',    sub:'Sobram R$800 por mês',           text:'Ganho R$3.000, gasto R$2.200, sobram R$800. Como começo a investir?' },
];

const clientRequests = [];
function clientRateLimited() {
  const now = Date.now();
  const recent = clientRequests.filter(t => now - t < 10000);
  if (recent.length >= 5) return true;
  clientRequests.push(now);
  return false;
}

export default function Home() {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [focused,     setFocused]     = useState(false);
  const [memOpen,     setMemOpen]     = useState(false);
  const [expenses,    setExpenses]    = useState([]);
  const [welcomed,    setWelcomed]    = useState(true);

  const bottomRef = useRef(null);
  const taRef     = useRef(null);

  // Carrega gastos do localStorage no mount
  useEffect(() => { setExpenses(loadExpenses()); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = 'auto';
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + 'px';
  }, [input]);

  const addExpense = useCallback((item) => {
    const newExp = {
      id: Date.now(),
      valor: item.valor,
      descricao: item.descricao || '',
      categoria: item.categoria || 'outros',
      data: new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    };
    setExpenses(prev => {
      const updated = [...prev, newExp];
      saveExpenses(updated);
      return updated;
    });
  }, []);

  const deleteExpense = useCallback((id) => {
    setExpenses(prev => {
      const updated = prev.filter(e => e.id !== id);
      saveExpenses(updated);
      return updated;
    });
  }, []);

  const clearAllExpenses = useCallback(() => {
    if (!confirm('Apagar todos os gastos salvos?')) return;
    setExpenses([]);
    saveExpenses([]);
  }, []);

  const canSend = !!input.trim() && !loading;

  const send = useCallback(async (txt) => {
    const text = (txt ?? input).trim();
    if (!text || loading) return;

    if (clientRateLimited()) {
      setMessages(prev => [...prev, { role:'assistant', content:'Devagar aí! Aguarde alguns segundos.' }]);
      return;
    }

    setWelcomed(false);
    setLoading(true);
    setInput('');

    const userMsg = { role:'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    const expCtx = buildExpenseContext(expenses);
    const limited = newHistory.slice(-10);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: limited,
          expenseContext: expCtx || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data  = await res.json();
      const reply = data.reply || 'Não consegui responder. Tente de novo.';

      const saveObj = tryParseSave(reply);
      if (saveObj) {
        addExpense(saveObj);
        setMessages(prev => [...prev,
          { role:'assistant', content: reply, savedItem: saveObj }
        ]);
      } else {
        setMessages(prev => [...prev, { role:'assistant', content: reply }]);
      }

    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'A IA demorou demais. Tente de novo.'
        : `Erro de conexão: ${err.message}`;
      setMessages(prev => [...prev, { role:'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, expenses, addExpense]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const askAboutExpenses = () => {
    setMemOpen(false);
    send('Quanto eu gastei até agora no total? Me mostra tudo que salvei e o que posso fazer com o dinheiro que sobrou.');
  };

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center',
      background:'#060b12', overflow:'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ width:'100%', maxWidth:740, padding:'14px 22px 12px',
        display:'flex', alignItems:'center', gap:12,
        borderBottom:'1px solid #0f1923', flexShrink:0 }}>
        <div style={{ width:40, height:40, borderRadius:11, flexShrink:0,
          background:'linear-gradient(135deg,#2dd4bf,#818cf8)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:19, boxShadow:'0 0 18px rgba(45,212,191,.3)' }}>💰</div>
        <div>
          <div style={{ fontWeight:800, fontSize:17, letterSpacing:'-.4px', color:'#f1f5f9' }}>
            Fin<span style={{ color:'#2dd4bf' }}>Mind</span>
          </div>
          <div style={{ fontSize:11, color:'#3d5166' }}>Consultor financeiro — direto ao ponto</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => setMemOpen(o => !o)} style={{
            background:'#0b1520', border:'1px solid #15263a', borderRadius:8,
            padding:'5px 10px', color:'#3d5166', fontSize:11, fontWeight:700,
            cursor:'pointer', fontFamily:'inherit',
            display:'flex', alignItems:'center', gap:5, transition:'all .15s',
            ...(memOpen ? { borderColor:'#2dd4bf', color:'#2dd4bf' } : {})
          }}>
            📋 Gastos
            {expenses.length > 0 && (
              <span style={{ background:'#2dd4bf', color:'#060b12', borderRadius:20,
                padding:'1px 6px', fontSize:10, fontWeight:800 }}>{expenses.length}</span>
            )}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80',
              boxShadow:'0 0 7px #4ade80', animation:'pulse 2s infinite' }} />
            <span style={{ fontSize:11, color:'#4ade80', fontWeight:700, letterSpacing:.5 }}>ONLINE</span>
          </div>
        </div>
      </header>

      {/* ── PAINEL DE MEMÓRIA ── */}
      {memOpen && (
        <MemPanel
          expenses={expenses}
          onDelete={deleteExpense}
          onClearAll={clearAllExpenses}
          onAsk={askAboutExpenses}
        />
      )}

      {/* ── CHAT ── */}
      <main style={{ width:'100%', maxWidth:740, flex:1, overflowY:'auto',
        padding:'18px 22px 8px', display:'flex', flexDirection:'column', gap:14 }}>

        {welcomed && messages.length === 0 && (
          <div style={{ paddingTop:24, textAlign:'center', animation:'pop .4s ease' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>📊</div>
            <h2 style={{ fontSize:16, fontWeight:700, color:'#f1f5f9', marginBottom:6 }}>
              Fala aí. Qual é a sua situação?
            </h2>
            <p style={{ fontSize:13, color:'#3d5166', lineHeight:1.6, marginBottom:22 }}>
              Me passa sua renda e gastos — vou analisar e posso{' '}
              <strong style={{ color:'#2dd4bf' }}>salvar seus gastos</strong> para te lembrar depois.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {QUICK.map((q, i) => (
                <button key={i} onClick={() => send(q.text)} style={{
                  background:'#0b1520', border:'1px solid #15263a', borderRadius:10,
                  padding:'11px 13px', color:'#6b8299', fontSize:12, cursor:'pointer',
                  textAlign:'left', lineHeight:1.4, fontFamily:'inherit', transition:'all .15s',
                }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(45,212,191,.35)';e.currentTarget.style.color='#dce9f5';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#15263a';e.currentTarget.style.color='#6b8299';}}>
                  {q.label}<br/><small style={{ opacity:.6 }}>{q.sub}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div style={{ display:'flex', animation:'pop .2s ease' }}>
            <TypingDots />
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* ── INPUT ── */}
      <footer style={{ width:'100%', maxWidth:740, padding:'10px 22px 16px',
        borderTop:'1px solid #0b1520', flexShrink:0 }}>
        <div style={{
          background:'#0b1520',
          border:`1px solid ${focused ? 'rgba(45,212,191,.4)' : '#15263a'}`,
          borderRadius:14, padding:'10px 11px 10px 15px',
          display:'flex', alignItems:'flex-end', gap:9,
          transition:'border-color .2s, box-shadow .2s',
          boxShadow: focused ? '0 0 0 3px rgba(45,212,191,.07)' : 'none',
        }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ex: Gastei R$50 no mercado hoje. Salva aí."
            rows={1}
            style={{ flex:1, background:'transparent', border:'none', outline:'none',
              color:'#dce9f5', fontSize:14, resize:'none', lineHeight:1.6,
              maxHeight:120, overflowY:'auto', fontFamily:'inherit' }}
          />
          <button
            onClick={() => send()}
            disabled={!canSend}
            style={{
              width:36, height:36, borderRadius:9, flexShrink:0, border:'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:18, transition:'all .2s',
              background: canSend ? 'linear-gradient(135deg,#2dd4bf,#818cf8)' : '#12202e',
              color: canSend ? '#fff' : '#243344',
              boxShadow: canSend ? '0 0 14px rgba(45,212,191,.4)' : 'none',
              transform: canSend ? 'scale(1)' : 'scale(.93)',
            }}>↑</button>
        </div>
        <p style={{ textAlign:'center', fontSize:11, color:'#111e2b', marginTop:7 }}>
          FinMind não garante rendimentos. Dados salvos apenas no seu navegador.
        </p>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes pop   { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tdot  { 0%,100%{transform:translateY(0);opacity:.3} 50%{transform:translateY(-4px);opacity:1} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        textarea::placeholder { color: #1e3048; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #152030; border-radius: 4px; }
        @media (max-width:500px) {
          .quick-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
