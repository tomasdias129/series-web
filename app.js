// Séries que estou a ver — versão web (para o iPhone). Fala diretamente com o Supabase, com a tua conta:
// a lista é a mesma do PC, do telemóvel e da extensão do Brave.
const SUPABASE = 'https://flqfhxembcecucwqhuqt.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZscWZoeGVtYmNlY3Vjd3FodXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTYwMTQsImV4cCI6MjA5NDg3MjAxNH0.yiAOPwL9iX01HeDCx_gqSXBpD8JGuqHaF3UphknfWs0';

const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Sessão ─────────────────────────────────────────────────────────
function lerSessao() { try { return JSON.parse(localStorage.getItem('sessao') || 'null'); } catch (e) { return null; } }
function guardarSessao(j, antiga) {
  const s = { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (j.expires_in || 3600) * 1000,
    user_id: (j.user && j.user.id) || (antiga && antiga.user_id), email: (j.user && j.user.email) || (antiga && antiga.email) };
  localStorage.setItem('sessao', JSON.stringify(s));
  return s;
}
async function entrar(email, password) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || 'Email ou palavra-passe errados.');
  return guardarSessao(j);
}
let aRenovar = null;
async function token() {
  const s = lerSessao();
  if (!s) return null;
  if (s.expira - 120000 > Date.now()) return s.access_token;
  aRenovar = aRenovar || (async () => {
    const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!r.ok) { if (r.status === 400 || r.status === 401) { localStorage.removeItem('sessao'); mostrarEntrar(); } return null; }
    return guardarSessao(await r.json(), s).access_token;
  })().finally(() => { aRenovar = null; });
  return aRenovar;
}
async function supa(caminho, opcoes = {}) {
  const t = await token();
  if (!t) throw new Error('sem sessão');
  const r = await fetch(`${SUPABASE}/rest/v1/${caminho}`, {
    ...opcoes, headers: { apikey: ANON, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const tx = await r.text();
  return tx ? JSON.parse(tx) : null;
}

// ── Estado ─────────────────────────────────────────────────────────
let series = [], progresso = {}, aba = 'em', pesquisa = '';
const ABAS = [
  ['em', 'Em curso', s => s.estado === 'Em curso'],
  ['pv', 'Por ver', s => porVer(s) > 0],
  ['quero', 'Quero ver', s => s.estado === 'Quero ver'],
  ['term', 'Terminadas', s => s.estado === 'Terminada'],
  ['larg', 'Largadas', s => s.estado === 'Largada'],
  ['fav', 'Favoritos', s => s.favorito],
  ['todas', 'Todas', s => true],
];
const COR = { 'Em curso': '#7cb8ff', 'Terminada': '#5fe39a', 'Quero ver': '#ffc800', 'Largada': '#ff6b7a' };

// ── Episódios («T2E5» / «15») ──────────────────────────────────────
function lerEp(t) {
  const s = String(t || '').trim();
  let m = s.match(/^T(\d+)\s*E(\d+)$/i);
  if (m) return { t: +m[1], e: +m[2], comT: true };
  m = s.match(/^(\d+)$/);
  return m ? { t: 1, e: +m[1], comT: false } : null;
}
const contagens = s => { const t = (s.episodios_temporadas || '').trim(); return t ? t.split(',').map(x => parseInt(x) || 0) : []; };
const rotulo = (t, e, comT) => comT || t > 1 ? `T${t}E${e}` : `${e}`;
function epMais(s) {
  const ep = lerEp(s.episodio), c = contagens(s);
  if (!ep) return c.length > 1 ? 'T1E1' : '1';
  if (ep.comT && c[ep.t - 1] > 0 && ep.e >= c[ep.t - 1] && ep.t < c.length) return `T${ep.t + 1}E1`;
  return rotulo(ep.t, ep.e + 1, ep.comT);
}
function epMenos(s) {
  const ep = lerEp(s.episodio), c = contagens(s);
  if (!ep) return '';
  if (ep.e > 1) return rotulo(ep.t, ep.e - 1, ep.comT);
  if (ep.t > 1 && c[ep.t - 2] > 0) return `T${ep.t - 1}E${c[ep.t - 2]}`;
  return '';
}
// como no PC: «T2E6» nas séries com temporadas, «Episódio 1111» nas outras
function epTotal(s, v = s.episodio) {
  const ep = lerEp(v);
  if (!ep) return '';
  return ep.comT ? `T${ep.t}E${ep.e}` : `Episódio ${ep.e}`;
}

// Quantos episódios já saíram e ainda não viste (igual ao PC)
function porVer(s, agora = Date.now()) {
  if (s.estado !== 'Em curso') return 0;
  const ep = lerEp(s.episodio);
  if (!ep) return 0;
  const prox = s.proximo_episodio_numero, em = s.proximo_episodio_em ? Date.parse(s.proximo_episodio_em) : null;
  if (ep.comT) {
    const c = contagens(s);
    if (ep.t <= c.length) {
      let falta = 0, certo = true;
      for (let t = ep.t; t <= c.length; t++) {
        const ultima = t === c.length;
        let sairam;
        if (ultima && prox > 0 && em) sairam = em > agora ? prox - 1 : prox;
        else if (c[t - 1] > 0) sairam = c[t - 1];
        else if (ultima && t > ep.t) sairam = 0;
        else { certo = false; break; }
        falta += Math.max(0, sairam - (t === ep.t ? ep.e : 0));
      }
      if (certo) return falta;
    }
  }
  if (prox > 0 && em) return Math.max(0, (em > agora ? prox - 1 : prox) - ep.e);
  if (!ep.comT && s.total_episodios > 0 && (s.temporadas_conhecidas || 1) <= 1) return Math.max(0, s.total_episodios - ep.e);
  return 0;
}

function quandoSai(iso) {
  const d = new Date(iso), hoje = new Date();
  const dias = Math.round((new Date(d.toDateString()) - new Date(hoje.toDateString())) / 86400000);
  const hora = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) return `${d.toLocaleDateString('pt-PT', { weekday: 'long' })} às ${hora}`;
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}
const minutos = seg => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

// O progresso da extensão ainda vale? (igual ao PC: a meio do atual/seguinte, ou acabado o atual)
function progressoDe(s) {
  const p = progresso[s.id];
  if (!p || Date.now() - Date.parse(p.atualizado_em) > 30 * 86400000) return null;
  const a = lerEp(s.episodio), n = lerEp(p.episodio);
  const igual = (p.episodio || '') === (s.episodio || '');
  if (p.terminado) return igual ? p : null;
  if (!a) return p;
  return igual || (n && (n.t > a.t || (n.t === a.t && n.e > a.e))) ? p : null;
}
const aMeio = p => p && !p.terminado && p.segundos > 0 && p.duracao > 0;

// Onde ver: o episódio da extensão, senão a pesquisa na plataforma
function linkVer(s) {
  const p = progressoDe(s);
  if (p && p.url && p.url.startsWith('https://')) return p.url;
  const q = encodeURIComponent((s.nome_pesquisa || s.nome || '').trim());
  switch ((s.plataforma || '').trim().toLowerCase()) {
    case 'crunchyroll': return `https://www.crunchyroll.com/search?q=${q}`;
    case 'netflix': return `https://www.netflix.com/search?q=${q}`;
    case 'stremio': return `https://web.stremio.com/#/search?search=${q}`;
    default: return null;
  }
}
const nomePlat = s => ({ crunchyroll: 'Crunchyroll', netflix: 'Netflix', stremio: 'Stremio' }[(s.plataforma || '').trim().toLowerCase()] || null);

// ── Carregar ───────────────────────────────────────────────────────
async function carregar() {
  try {
    const [lista, prog] = await Promise.all([
      supa('series?select=*&order=nome'),
      supa('progresso?select=serie_id,episodio,url,segundos,duracao,terminado,atualizado_em').catch(() => [])
    ]);
    series = lista.filter(s => s.nome);
    progresso = {};
    prog.forEach(p => { progresso[p.serie_id] = p; });
    await acertarComRegisto(prog);
    desenhar();
  } catch (e) {
    if (String(e.message).includes('sem sessão')) return;
    aviso('Sem ligação. Tenta outra vez daqui a pouco.');
  }
}

// O registo de cada série (episódio mais alto que já teve) ganha quando a lista está atrás (igual ao PC)
async function acertarComRegisto(prog) {
  const acertos = [];
  for (const p of prog) {
    const s = series.find(x => x.id === p.serie_id);
    if (!s || s.estado === 'Terminada') continue;
    const ep = lerEp(p.episodio);
    if (!ep) continue;
    const visto = p.terminado ? p.episodio : ep.e > 1 ? rotulo(ep.t, ep.e - 1, ep.comT) : null;
    const v = lerEp(visto), a = lerEp(s.episodio);
    if (!v || (a && !(v.t > a.t || (v.t === a.t && v.e > a.e)))) continue;
    try {
      await supa(`series?id=eq.${s.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ episodio: visto, estado: 'Em curso' }) });
      s.episodio = visto; s.estado = 'Em curso';
      acertos.push(`${s.nome} → ${epTotal(s)}`);
    } catch (e) { }
  }
  if (acertos.length) aviso('✓ Visto na extensão: ' + acertos.join(' · '), 5000);
}

// ── Desenhar ───────────────────────────────────────────────────────
function norm(t) { return String(t || '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase(); }

function desenhar() {
  const q = norm(pesquisa);
  const filtro = ABAS.find(a => a[0] === aba)[2];
  $('abas').innerHTML = ABAS.map(([id, nome, f]) => `<button class="aba${id === aba ? ' on' : ''}" data-a="${id}">${nome}<small>${series.filter(f).length}</small></button>`).join('');
  $('abas').querySelectorAll('.aba').forEach(b => b.onclick = () => { aba = b.dataset.a; desenhar(); });

  // destaque: só sem pesquisa, nas abas «Em curso» e «Todas»
  const emCurso = series.filter(s => s.estado === 'Em curso')
    .sort((a, b) => ((aMeio(progressoDe(b)) ? 1 : 0) - (aMeio(progressoDe(a)) ? 1 : 0)) || (porVer(b) - porVer(a)) || a.nome.localeCompare(b.nome));
  $('destaque').innerHTML = !q && (aba === 'em' || aba === 'todas') ? emCurso.slice(0, 6).map(cartaoDestaque).join('') : '';
  $('destaque').querySelectorAll('[data-ver]').forEach(b => b.onclick = e => { e.stopPropagation(); abrirLink(b.dataset.ver); });
  $('destaque').querySelectorAll('.dest').forEach(d => d.onclick = () => abrirDetalhes(+d.dataset.id));

  const lista = series.filter(filtro).filter(s => !q || norm(s.nome).includes(q) || norm(s.nome_pesquisa).includes(q));
  $('grelha').innerHTML = lista.map(cartao).join('');
  $('grelha').querySelectorAll('.cartao').forEach(c => c.onclick = () => abrirDetalhes(+c.dataset.id));
  $('vazio').hidden = lista.length > 0;
  $('vazio').textContent = q ? 'Nenhuma série com esse nome.' : 'Nada aqui por agora.';
}

function cartaoDestaque(s) {
  const p = progressoDe(s), pv = porVer(s), meio = aMeio(p), link = linkVer(s), plat = nomePlat(s);
  const meta = meio ? `<div class="meta meio">A meio do ${esc(epTotal(s, p.episodio).replace('Episódio ', 'ep. '))} · ${minutos(p.segundos)} de ${minutos(p.duracao)}</div><div class="barra"><i style="width:${Math.min(100, Math.round(p.segundos * 100 / p.duracao))}%"></i></div>`
    : `<div class="meta">${s.episodio ? esc(epTotal(s)) + ' visto' : 'Ainda não começaste'}${pv ? ` · <b>${pv} por ver</b>` : ''}</div>`;
  const prox = s.proximo_episodio_em && Date.parse(s.proximo_episodio_em) > Date.now() ? `<div class="meta">⏰ Ep. ${s.proximo_episodio_numero} sai ${esc(quandoSai(s.proximo_episodio_em))}</div>` : '';
  const img = s.imagem_url ? `url('${esc(s.imagem_url)}')` : 'none';
  return `<div class="dest" data-id="${s.id}"><div class="bg" style="background-image:${img}"></div><div class="poster" style="background-image:${img}"></div>
    <div class="tx"><span class="tag">${meio ? 'A MEIO DO EPISÓDIO' : pv ? 'CONTINUA A VER' : 'A VER AGORA'}</span><h2>${esc(s.nome)}</h2>${meta}${prox}
    <div class="bts">${link ? `<button class="ver" data-ver="${esc(link)}">▶ Continuar${plat ? ' na ' + plat : ''}</button>` : ''}<button class="det">Detalhes</button></div></div></div>`;
}

function cartao(s) {
  const pv = porVer(s), p = progressoDe(s);
  const nota = parseInt(s.avaliacao) > 0 ? `<span class="nota">${esc(s.avaliacao)}</span>` : '';
  const img = s.imagem_url ? `<div class="img" style="background-image:url('${esc(s.imagem_url)}')"></div>` : `<div class="ini">${esc((s.nome || '?')[0].toUpperCase())}</div>`;
  const prog = aMeio(p) ? `<span class="prog"><i style="width:${Math.min(100, Math.round(p.segundos * 100 / p.duracao))}%"></i></span>` : `<span class="faixa" style="background:${COR[s.estado] || '#555'}"></span>`;
  return `<button class="cartao" data-id="${s.id}">${img}<span class="grad"></span>${pv ? `<span class="pv">${pv} por ver</span>` : ''}${nota}<span class="nome">${esc(s.nome)}</span>${prog}</button>`;
}

// ── Folha (detalhes, formulários) ──────────────────────────────────
function abrirFolha(html) {
  $('folha').innerHTML = '<div class="puxador"></div>' + html;
  $('folha').hidden = false; $('fundoFolha').hidden = false;
  $('folha').scrollTop = 0;
}
function fecharFolha() { $('folha').hidden = true; $('fundoFolha').hidden = true; }
$('fundoFolha').onclick = fecharFolha;

function abrirLink(url) { window.open(url, '_blank', 'noopener'); }

function abrirDetalhes(id) {
  const s = series.find(x => x.id === id);
  if (!s) return;
  const pv = porVer(s), p = progressoDe(s), link = linkVer(s), plat = nomePlat(s);
  const prox = s.proximo_episodio_em && Date.parse(s.proximo_episodio_em) > Date.now() ? `<div class="proximo">⏰ Ep. ${s.proximo_episodio_numero} sai ${esc(quandoSai(s.proximo_episodio_em))}</div>` : '';
  const generos = (s.generos || '').split(',').map(g => g.trim()).filter(Boolean).slice(0, 4).map(g => `<span class="chip">${esc(g)}</span>`).join('');
  abrirFolha(`
    <div class="det-topo"><div class="poster" style="background-image:url('${esc(s.imagem_url || '')}')"></div>
      <div><h2>${esc(s.nome)}</h2><span class="chip" style="background:${COR[s.estado] || '#444'};color:#14141c">${esc(s.estado || '—')}</span>${s.favorito ? '<span class="chip">★ Favorita</span>' : ''}${pv ? `<span class="chip" style="background:var(--azul)">${pv} por ver</span>` : ''}<div>${generos}</div></div></div>
    <div class="linhas">
      <div class="linha-det"><span>Episódio</span><div class="ep-ctrl"><button id="dMenos" aria-label="Menos um">−</button><b id="dEp">${esc(s.episodio ? epTotal(s) : '—')}</b><button id="dMais" aria-label="Mais um">+</button></div></div>
      ${aMeio(p) ? `<div class="linha-det"><span>A meio</span><b>${esc(epTotal(s, p.episodio))} · ${minutos(p.segundos)} de ${minutos(p.duracao)}</b></div>` : ''}
      <div class="linha-det"><span>Avaliação</span><b>${parseInt(s.avaliacao) > 0 ? esc(s.avaliacao) + '/10' : '—'}</b></div>
      <div class="linha-det"><span>Plataforma</span><b>${esc(s.plataforma || '—')}</b></div>
    </div>
    ${prox}
    ${s.sinopse ? `<p class="sinopse">${esc(s.sinopse)}</p>` : ''}
    <div class="acoes">
      ${link ? `<button class="a-ver" id="dVer">▶ ${aMeio(p) ? 'Continuar' : 'Ver'}${plat ? ' na ' + plat : ''}</button>` : ''}
      ${s.estado !== 'Terminada' ? '<button class="a-verde" id="dTerm">✓ Terminada</button>' : ''}
      <button class="a-sec" id="dFav">${s.favorito ? '★ Tirar dos favoritos' : '☆ Favorita'}</button>
      <button class="a-sec" id="dEditar">Editar</button>
      <button class="a-perigo" id="dRemover">Remover</button>
    </div>`);
  $('dMais').onclick = () => mudar(s, { episodio: epMais(s), ...(s.estado === 'Quero ver' || s.estado === 'Largada' ? { estado: 'Em curso' } : {}) }, true);
  $('dMenos').onclick = () => { const v = epMenos(s); mudar(s, { episodio: v }, true); };
  if ($('dVer')) $('dVer').onclick = () => abrirLink(link);
  if ($('dTerm')) $('dTerm').onclick = () => pedirNota(s);
  $('dFav').onclick = () => mudar(s, { favorito: !s.favorito }, true);
  $('dEditar').onclick = () => abrirFormulario(s);
  $('dRemover').onclick = async () => {
    if (!confirm(`Remover «${s.nome}» da tua lista?`)) return;
    try { await supa(`series?id=eq.${s.id}`, { method: 'DELETE' }); series = series.filter(x => x.id !== s.id); fecharFolha(); desenhar(); aviso('Removida'); }
    catch (e) { aviso('Não consegui remover.'); }
  };
}

async function mudar(s, campos, reabrir) {
  const antes = { ...s };
  Object.assign(s, campos);
  desenhar();
  if (reabrir) abrirDetalhes(s.id);
  try { await supa(`series?id=eq.${s.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) }); }
  catch (e) { Object.assign(s, antes); desenhar(); if (reabrir) abrirDetalhes(s.id); aviso('Não consegui guardar. Vê a ligação.'); }
}

function pedirNota(s) {
  abrirFolha(`<h2>Terminaste «${esc(s.nome)}»!</h2><p class="suave">Que nota lhe dás?</p>
    <div class="notas">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>
    <button class="sec" id="semNota" style="width:100%">Sem nota</button>`);
  $('folha').querySelectorAll('[data-n]').forEach(b => b.onclick = () => { mudar(s, { estado: 'Terminada', avaliacao: b.dataset.n }); fecharFolha(); aviso('✓ Terminada'); });
  $('semNota').onclick = () => { mudar(s, { estado: 'Terminada' }); fecharFolha(); aviso('✓ Terminada'); };
}

function abrirFormulario(s) {
  const nova = !s;
  s = s || { nome: '', estado: 'Em curso', episodio: '', plataforma: '' };
  abrirFolha(`<h2>${nova ? 'Nova série' : 'Editar'}</h2>
    <form class="form" id="fSerie">
      <label>Nome</label><input type="text" id="fNome" value="${esc(s.nome)}" required>
      <label>Estado</label><select id="fEstado">${['Em curso', 'Quero ver', 'Terminada', 'Largada'].map(e => `<option${e === s.estado ? ' selected' : ''}>${e}</option>`).join('')}</select>
      <label>Episódio (último que viste: «12» ou «T2E5»)</label><input type="text" id="fEp" value="${esc(s.episodio || '')}" autocapitalize="characters">
      <label>Plataforma</label><select id="fPlat">${['', 'CrunchyRoll', 'Netflix', 'Stremio'].map(p => `<option value="${p}"${(p || '').toLowerCase() === (s.plataforma || '').toLowerCase() ? ' selected' : ''}>${p || '—'}</option>`).join('')}</select>
      <button class="prim" type="submit">${nova ? 'Adicionar' : 'Guardar'}</button>
    </form>`);
  $('fSerie').onsubmit = async e => {
    e.preventDefault();
    const dados = { nome: $('fNome').value.trim(), estado: $('fEstado').value, episodio: $('fEp').value.trim().toUpperCase(), plataforma: $('fPlat').value };
    if (!dados.nome) return;
    if (dados.episodio && !lerEp(dados.episodio)) { aviso('O episódio é «12» ou «T2E5».'); return; }
    try {
      if (nova) {
        await supa('series', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...dados, user_id: lerSessao().user_id }) });
        aviso('✓ Adicionada (o PC vai buscar o poster e a informação)');
      } else {
        await supa(`series?id=eq.${s.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dados) });
        aviso('✓ Guardado');
      }
      fecharFolha(); carregar();
    } catch (er) { aviso('Não consegui guardar.'); }
  };
}

function abrirCalendario() {
  const proximos = series.filter(s => s.proximo_episodio_em && Date.parse(s.proximo_episodio_em) > Date.now() - 3600000 && s.estado !== 'Terminada')
    .sort((a, b) => Date.parse(a.proximo_episodio_em) - Date.parse(b.proximo_episodio_em));
  let html = '<h2>Próximos episódios</h2>', dia = '';
  if (!proximos.length) html += '<p class="suave">Nenhum episódio marcado.</p>';
  for (const s of proximos) {
    const d = new Date(s.proximo_episodio_em);
    let nomeDia = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    nomeDia = nomeDia.charAt(0).toUpperCase() + nomeDia.slice(1);
    if (nomeDia !== dia) { dia = nomeDia; html += `<div class="cal-dia">${esc(nomeDia)}</div>`; }
    html += `<div class="cal-ep" data-id="${s.id}"><span><b>${esc(s.nome)}</b><br><span class="suave">Ep. ${s.proximo_episodio_numero}</span></span><b>${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</b></div>`;
  }
  abrirFolha(html);
  $('folha').querySelectorAll('.cal-ep').forEach(c => c.onclick = () => abrirDetalhes(+c.dataset.id));
}

function abrirMenu() {
  const s = lerSessao();
  abrirFolha(`<p class="suave">${esc(s && s.email)}</p>
    <button class="menu-op" id="mAtualizar">↻ Atualizar a lista</button>
    <button class="menu-op" id="mSair" style="color:var(--vermelho)">Terminar sessão</button>
    <p class="suave" style="font-size:12px;margin-top:14px">Para instalar: no Safari, Partilhar → «Adicionar ao ecrã principal».</p>`);
  $('mAtualizar').onclick = () => { fecharFolha(); carregar(); aviso('A atualizar…'); };
  $('mSair').onclick = () => { localStorage.removeItem('sessao'); fecharFolha(); mostrarEntrar(); };
}

let tAviso = null;
function aviso(texto, ms = 2600) {
  $('aviso').textContent = texto; $('aviso').classList.add('on');
  clearTimeout(tAviso); tAviso = setTimeout(() => $('aviso').classList.remove('on'), ms);
}

// ── Arranque ───────────────────────────────────────────────────────
function mostrarEntrar() { $('app').hidden = true; $('entrar').hidden = false; }
function mostrarApp() { $('entrar').hidden = true; $('app').hidden = false; carregar(); }

$('fEntrar').onsubmit = async e => {
  e.preventDefault();
  $('erroEntrar').textContent = '';
  try { await entrar($('email').value.trim(), $('pass').value); mostrarApp(); }
  catch (er) { $('erroEntrar').textContent = er.message; }
};
$('q').oninput = () => { pesquisa = $('q').value; desenhar(); };
$('bNova').onclick = () => abrirFormulario(null);
$('bCal').onclick = abrirCalendario;
$('bMenu').onclick = abrirMenu;

// volta a ler quando voltas à app, e de minuto a minuto com ela aberta
document.addEventListener('visibilitychange', () => { if (!document.hidden && lerSessao()) carregar(); });
setInterval(() => { if (!document.hidden && lerSessao() && $('folha').hidden) carregar(); }, 60000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
if (lerSessao()) mostrarApp(); else mostrarEntrar();
