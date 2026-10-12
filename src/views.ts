import type { Article } from './db';

const STYLES = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { background: #15171a; color: #d0d4d8; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0; }
a { color: #a8b4c0; text-decoration: none; }
a:hover { text-decoration: underline; }
header { border-bottom: 1px solid #2a2d31; padding: 12px 20px; display: flex; align-items: center; gap: 20px; }
header .brand { font-weight: 600; color: #e8c896; letter-spacing: 0.3px; }
nav { display: flex; gap: 16px; }
nav a { color: #8893a0; font-size: 13px; }
nav a.active { color: #e8c896; }
main { max-width: 900px; margin: 0 auto; padding: 8px 20px 40px; }
.row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #23262a; }
.row:last-child { border-bottom: 0; }
.num { color: #4d535a; font-size: 13px; min-width: 28px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.badge { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #fff; flex-shrink: 0; }
.body { flex: 1; min-width: 0; }
.title { font-size: 14px; line-height: 1.4; }
.title a { color: #d0d4d8; }
.title a:visited { color: #888e94; }
.meta { font-size: 11px; color: #6d747b; margin-top: 3px; }
.meta a { color: #6d747b; }
.meta a:hover { color: #a8b4c0; }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
.actions form { margin: 0; }
.actions button { background: none; border: 1px solid #3a3e44; color: #8893a0; padding: 4px 9px; font: inherit; font-size: 11px; border-radius: 3px; cursor: pointer; line-height: 1; }
.actions button:hover { color: #d0d4d8; border-color: #5a5e64; }
.actions button.saved { color: #e8c896; border-color: #5a4f3a; }
.actions button.saved:hover { color: #efd4a8; border-color: #7a6a4a; }
.empty { color: #6d747b; padding: 60px 0; text-align: center; }
.pager { display: flex; gap: 16px; padding: 16px 0 0; font-size: 13px; color: #6d747b; }
.pager a { color: #a8b4c0; }
.pager span.disabled { color: #3a3e44; }
textarea { width: 100%; min-height: 360px; background: #1a1d20; color: #d0d4d8; border: 1px solid #2a2d31; padding: 12px; font: 13px/1.5 ui-monospace, SFMono-Regular, monospace; border-radius: 4px; resize: vertical; }
.threshold-input { width: 80px; background: #1a1d20; color: #d0d4d8; border: 1px solid #2a2d31; padding: 8px 10px; font: 14px -apple-system, sans-serif; border-radius: 4px; }
.threshold-input:focus { outline: none; border-color: #e8c896; }
.prompt-form { margin: 0; }
.prompt-form button { background: #e8c896; color: #15171a; border: 0; padding: 8px 18px; border-radius: 4px; font: inherit; font-weight: 600; cursor: pointer; margin-top: 10px; }
.prompt-form button:hover { background: #efd4a8; }
.fixed-block { background: #1a1d20; color: #888e94; border: 1px dashed #2a2d31; padding: 12px; font: 12px/1.5 ui-monospace, monospace; border-radius: 4px; white-space: pre-wrap; }
.section-label { font-size: 11px; color: #6d747b; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 8px; }
.flash { background: #1f3a25; color: #a8d4a8; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid #2d5235; }
.login-wrap { max-width: 360px; margin: 80px auto; }
.login-wrap h1 { color: #e8c896; font-size: 20px; font-weight: 600; letter-spacing: 0.3px; margin: 0 0 24px; }
.login-form { display: flex; flex-direction: column; gap: 12px; }
.login-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #8893a0; }
.login-form input { background: #1a1d20; color: #d0d4d8; border: 1px solid #2a2d31; padding: 9px 12px; font: 14px -apple-system, sans-serif; border-radius: 4px; }
.login-form input:focus { outline: none; border-color: #e8c896; }
.login-form button { background: #e8c896; color: #15171a; border: 0; padding: 9px 16px; border-radius: 4px; font: inherit; font-weight: 600; cursor: pointer; margin-top: 4px; }
.login-form button:hover { background: #efd4a8; }
.login-error { color: #e09090; font-size: 13px; }
.logout-link { margin-left: auto; color: #6d747b !important; font-size: 12px; }
.feed-empty { color: #6d747b; padding: 60px 0; text-align: center; }
.feed-header { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0 14px; border-bottom: 1px solid #2a2d31; margin-bottom: 12px; }
.feed-title-block { flex: 1; min-width: 0; }
.feed-title { font-size: 16px; line-height: 1.4; }
.feed-title a { color: #d0d4d8; }
.feed-title a:visited { color: #888e94; }
.feed-actions { display: flex; gap: 6px; align-self: center; }
.feed-actions button { background: none; border: 1px solid #3a3e44; color: #8893a0; padding: 7px 14px; font: inherit; font-size: 14px; border-radius: 3px; cursor: pointer; line-height: 1; }
.feed-actions button:hover { color: #d0d4d8; border-color: #5a5e64; }
.feed-actions button:disabled { opacity: 0.5; cursor: default; }
.feed-frame { display: block; width: 100vw; position: relative; left: 50%; margin-left: -50vw; height: calc(100vh - 142px); min-height: 420px; background: #fff; border: 0; border-top: 1px solid #2a2d31; }
body.tab-feed main { padding-bottom: 0; }
`;

function badgeColor(level: number): string {
  const clamped = Math.max(0, Math.min(100, level));
  const hue = clamped * 1.2; // 0 = maroon, 120 = green
  return `hsl(${hue}, 55%, 38%)`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function domain(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const TABS: Array<[string, string]> = [
  ['/', 'feed'],
  ['/uninteresting', 'uninteresting'],
  ['/saved', 'saved'],
  ['/read', 'read'],
  ['/prompt', 'prompt'],
];

export function shell(activeTab: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(activeTab)} · newspaper</title>
<style>${STYLES}</style>
</head>
<body class="tab-${escapeHtml(activeTab)}">
<header>
  <div class="brand">newspaper</div>
  <nav>
    ${TABS.map(([href, name]) => `<a href="${href}"${activeTab === name ? ' class="active"' : ''}>${name}</a>`).join('')}
  </nav>
  <a href="/logout" class="logout-link">log out</a>
</header>
<main>${content}</main>
</body>
</html>`;
}

export function loginPage(next: string, error: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sign in · newspaper</title>
<style>${STYLES}</style>
</head>
<body>
<div class="login-wrap">
  <h1>newspaper</h1>
  <form method="post" action="/login" class="login-form" autocomplete="on">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label>
      <span>username</span>
      <input type="text" name="username" autocomplete="username" autofocus required>
    </label>
    <label>
      <span>password</span>
      <input type="password" name="password" autocomplete="current-password" required>
    </label>
    ${error ? '<div class="login-error">Invalid username or password.</div>' : ''}
    <button type="submit">sign in</button>
  </form>
</div>
</body>
</html>`;
}

function articleRow(a: Article, num: number): string {
  const dom = domain(a.url);
  const titleHref = a.url ? `/open/${a.id}` : `/comments/${a.id}`;
  const titleExternal = a.url ? ' target="_blank" rel="noopener"' : '';
  const saveAction = a.saved_at
    ? `<form method="post" action="/unsave/${a.id}"><button type="submit" class="saved" title="unsave">★</button></form>`
    : `<form method="post" action="/save/${a.id}"><button type="submit" title="save">☆</button></form>`;
  const dismissAction = a.dismissed_at
    ? `<form method="post" action="/undismiss/${a.id}"><button type="submit" title="restore (undismiss)">↺</button></form>`
    : `<form method="post" action="/dismiss/${a.id}"><button type="submit" title="not interested">✕</button></form>`;
  const readAction = a.read_at
    ? ''
    : `<form method="post" action="/mark-read/${a.id}"><button type="submit" title="mark read without opening">✓</button></form>`;
  return `<div class="row">
  <span class="num">${num}.</span>
  <span class="badge" style="background: ${badgeColor(a.interest_level)}">${a.interest_level}</span>
  <div class="body">
    <div class="title"><a href="${titleHref}"${titleExternal}>${escapeHtml(a.title)}</a></div>
    <div class="meta">
      ${dom ? `${escapeHtml(dom)} · ` : ''}${a.hn_score} pts · <a href="/comments/${a.id}" target="_blank" rel="noopener">${a.hn_comments} comments</a>
    </div>
  </div>
  <div class="actions">
    ${readAction}
    ${saveAction}
    ${dismissAction}
  </div>
</div>`;
}

function pager(basePath: string, page: number, hasMore: boolean): string {
  const prevHref = page > 2 ? `${basePath}?page=${page - 1}` : basePath;
  const nextHref = `${basePath}?page=${page + 1}`;
  const prev = page > 1 ? `<a href="${prevHref}">‹ prev</a>` : `<span class="disabled">‹ prev</span>`;
  const next = hasMore ? `<a href="${nextHref}">next ›</a>` : `<span class="disabled">next ›</span>`;
  return `<div class="pager">${prev}<span>page ${page}</span>${next}</div>`;
}

const PAGE_SIZE_VIEW = 30;

export function listPage(
  activeTab: string,
  basePath: string,
  page: number,
  items: Article[],
  hasMore: boolean,
  emptyMsg: string
): string {
  const startNum = (page - 1) * PAGE_SIZE_VIEW + 1;
  let content: string;
  if (items.length === 0) {
    content = `<div class="empty">${escapeHtml(emptyMsg)}</div>`;
    if (page > 1) content += pager(basePath, page, false);
  } else {
    content = items.map((a, i) => articleRow(a, startNum + i)).join('');
    content += pager(basePath, page, hasMore);
  }
  return shell(activeTab, content);
}

export function feedPage(initialBatch: Article[]): string {
  const json = JSON.stringify(initialBatch).replace(/</g, '\\u003c');
  const content = `
<div id="feed-empty" class="feed-empty" hidden>Inbox zero. New stories arrive every 30 minutes.</div>
<div id="feed-article"></div>
<script id="feed-data" type="application/json">${json}</script>
<script>${FEED_SCRIPT}</script>`;
  return shell('feed', content);
}

const FEED_SCRIPT = `
(function(){
  const initial = JSON.parse(document.getElementById('feed-data').textContent);
  const empty = document.getElementById('feed-empty');
  const wrap = document.getElementById('feed-article');
  const queue = initial.slice();
  let fetching = false;
  const LOW_WATER = 2;

  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function badgeColor(level){const c=Math.max(0,Math.min(100,level));return 'hsl('+(c*1.2)+', 55%, 38%)';}
  function domain(url){try{return new URL(url).hostname.replace(/^www\\./,'');}catch(e){return '';}}

  function render(){
    if(queue.length===0){wrap.innerHTML='';empty.hidden=false;return;}
    empty.hidden=true;
    const a=queue[0];
    const hnUrl='https://news.ycombinator.com/item?id='+a.id;
    const titleHref=a.url||hnUrl;
    const frameSrc=a.url||hnUrl;
    const dom=a.url?domain(a.url):'news.ycombinator.com';
    wrap.innerHTML=
      '<div class="feed-header">'+
        '<span class="badge" style="background:'+badgeColor(a.interest_level)+'">'+a.interest_level+'</span>'+
        '<div class="feed-title-block">'+
          '<div class="feed-title"><a href="'+esc(titleHref)+'" target="_blank" rel="noopener">'+esc(a.title)+'</a></div>'+
          '<div class="meta">'+esc(dom)+' · '+a.hn_score+' pts · <a href="'+esc(hnUrl)+'" target="_blank" rel="noopener">'+a.hn_comments+' comments</a></div>'+
        '</div>'+
        '<div class="feed-actions">'+
          '<button data-action="mark-read" title="mark read">✓</button>'+
          '<button data-action="save" title="save">☆</button>'+
          '<button data-action="dismiss" title="not interested">✕</button>'+
        '</div>'+
      '</div>'+
      '<iframe class="feed-frame" src="'+esc(frameSrc)+'" referrerpolicy="no-referrer"></iframe>';
    wrap.querySelectorAll('button[data-action]').forEach(b=>{
      b.addEventListener('click',()=>act(b.dataset.action));
    });
  }

  function act(action){
    const a=queue.shift();
    if(!a)return;
    render();
    if(queue.length<LOW_WATER)refill();
    fetch('/'+action+'/'+a.id,{method:'POST',redirect:'manual'}).catch(e=>console.error('action failed',e));
  }

  async function refill(){
    if(fetching)return;
    fetching=true;
    try{
      const wasEmpty=queue.length===0;
      const exclude=queue.map(a=>a.id).join(',');
      const res=await fetch('/feed/batch'+(exclude?'?exclude='+exclude:''));
      if(!res.ok)return;
      const data=await res.json();
      const have=new Set(queue.map(a=>a.id));
      for(const a of (data.items||[])){if(!have.has(a.id))queue.push(a);}
      if(wasEmpty&&queue.length>0)render();
    }catch(e){console.error('refill failed',e);}finally{fetching=false;}
  }

  render();
  if(queue.length<LOW_WATER)refill();
})();
`;

export function promptPage(
  currentPrompt: string,
  currentThreshold: number,
  decisionInstructions: string,
  responseSchema: unknown,
  saved: boolean
): string {
  const schemaJson = JSON.stringify(responseSchema, null, 2);
  const content = `
${saved ? `<div class="flash">Saved.</div>` : ''}
<form method="post" action="/prompt" class="prompt-form">
  <div class="section-label">Score threshold (0–100, the chance you want to read it; at or above appears in the feed)</div>
  <input type="number" name="interest_threshold" min="0" max="100" step="1" value="${currentThreshold}" class="threshold-input">
  <div class="section-label">System prompt</div>
  <textarea name="system_prompt" spellcheck="false">${escapeHtml(currentPrompt)}</textarea>
  <button type="submit">save</button>
</form>
<div class="section-label">Appended to the prompt (fixed)</div>
<div class="fixed-block">${escapeHtml(decisionInstructions)}</div>
<div class="section-label">Response schema (enforced by the API via structured outputs)</div>
<div class="fixed-block">${escapeHtml(schemaJson)}</div>`;
  return shell('prompt', content);
}
