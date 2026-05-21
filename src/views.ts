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
.badge { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #fff; flex-shrink: 0; position: relative; cursor: help; }
.badge:hover::after {
  content: attr(data-reason);
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 320px;
  background: #1f2226;
  border: 1px solid #3a3e44;
  padding: 8px 10px;
  border-radius: 4px;
  font: 400 12px/1.5 -apple-system, sans-serif;
  color: #d0d4d8;
  white-space: normal;
  z-index: 10;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
}
.body { flex: 1; min-width: 0; }
.title { font-size: 14px; line-height: 1.4; }
.title a { color: #d0d4d8; }
.title a:visited { color: #888e94; }
.meta { font-size: 11px; color: #6d747b; margin-top: 3px; }
.meta a { color: #6d747b; }
.meta a:hover { color: #a8b4c0; }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
.actions form { margin: 0; }
.actions button { background: none; border: 1px solid #3a3e44; color: #8893a0; padding: 4px 9px; font: inherit; font-size: 11px; border-radius: 3px; cursor: pointer; }
.actions button:hover { color: #d0d4d8; border-color: #5a5e64; }
.empty { color: #6d747b; padding: 60px 0; text-align: center; }
textarea { width: 100%; min-height: 360px; background: #1a1d20; color: #d0d4d8; border: 1px solid #2a2d31; padding: 12px; font: 13px/1.5 ui-monospace, SFMono-Regular, monospace; border-radius: 4px; resize: vertical; }
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
`;

function badgeColor(level: number): string {
  const clamped = Math.max(0, Math.min(10, level));
  const hue = clamped * 12; // 0 = maroon, 120 = green
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
<body>
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

function articleRow(a: Article, includeMarkRead: boolean): string {
  const dom = domain(a.url);
  const titleHref = a.url ? `/open/${a.id}` : `/comments/${a.id}`;
  const titleExternal = a.url ? ' target="_blank" rel="noopener"' : '';
  return `<div class="row">
  <span class="badge" style="background: ${badgeColor(a.interest_level)}" data-reason="${escapeHtml(a.interest_reason)}">${a.interest_level}</span>
  <div class="body">
    <div class="title"><a href="${titleHref}"${titleExternal}>${escapeHtml(a.title)}</a></div>
    <div class="meta">
      ${dom ? `${escapeHtml(dom)} · ` : ''}${a.hn_score} pts · <a href="/comments/${a.id}" target="_blank" rel="noopener">${a.hn_comments} comments</a>
    </div>
  </div>
  <div class="actions">
    ${includeMarkRead ? `<form method="post" action="/mark-read/${a.id}"><button type="submit" title="mark read without opening">✓</button></form>` : ''}
  </div>
</div>`;
}

export function listPage(activeTab: string, articles: Article[], emptyMsg: string, includeMarkRead: boolean): string {
  const content =
    articles.length === 0
      ? `<div class="empty">${escapeHtml(emptyMsg)}</div>`
      : articles.map((a) => articleRow(a, includeMarkRead)).join('');
  return shell(activeTab, content);
}

export function promptPage(currentPrompt: string, responseSchema: unknown, saved: boolean): string {
  const schemaJson = JSON.stringify(responseSchema, null, 2);
  const content = `
${saved ? `<div class="flash">Saved.</div>` : ''}
<div class="section-label">System prompt (editable)</div>
<form method="post" action="/prompt" class="prompt-form">
  <textarea name="system_prompt" spellcheck="false">${escapeHtml(currentPrompt)}</textarea>
  <button type="submit">save</button>
</form>
<div class="section-label">Response schema (enforced by the API via structured outputs)</div>
<div class="fixed-block">${escapeHtml(schemaJson)}</div>`;
  return shell('prompt', content);
}
