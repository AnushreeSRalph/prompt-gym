export function getWebviewHtml(nonce: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-size: 13px;
    overflow: hidden;
  }

  /* ── Layout shells ───────────────────────────────── */
  .container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

  /* ── Toolbar ─────────────────────────────────────── */
  .toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0; flex-wrap: wrap;
    background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
  }
  .brand {
    font-weight: 700; font-size: 13px;
    letter-spacing: -0.02em; flex-shrink: 0;
    display: flex; align-items: center; gap: 6px;
  }
  .brand-icon { font-size: 15px; }

  .model-select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
    padding: 3px 8px; border-radius: 3px;
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; flex-shrink: 0;
  }

  .stats { display: flex; gap: 14px; align-items: center; margin-left: auto; }

  .stat { display: flex; flex-direction: column; align-items: flex-end; }
  .stat .val {
    font-size: 15px; font-weight: 700;
    font-family: var(--vscode-editor-font-family);
    line-height: 1.2;
    transition: color 0.3s;
  }
  .stat .lbl {
    color: var(--vscode-descriptionForeground);
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .stat.s-warn .val { color: var(--vscode-editorWarning-foreground, #cca700); }
  .stat.s-save .val { color: var(--vscode-charts-green, #89d185); }

  .btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 5px 12px; border-radius: 2px;
    font-size: 12px; cursor: pointer;
    font-family: var(--vscode-font-family); white-space: nowrap; flex-shrink: 0;
    transition: background 0.15s;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn:active { opacity: 0.8; }
  .btn.sec {
    background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .btn.sec:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(127,127,127,0.25)); }

  /* ── Context bar ─────────────────────────────────── */
  .ctx-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 5px 14px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .ctx-label { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .ctx-track {
    flex: 1; height: 5px; border-radius: 3px;
    background: rgba(127,127,127,0.18); overflow: hidden;
  }
  .ctx-fill {
    height: 100%; border-radius: 3px;
    background: var(--vscode-charts-green, #89d185);
    transition: width 0.35s cubic-bezier(.4,0,.2,1), background-color 0.3s;
    min-width: 2px;
  }
  .ctx-fill.warn   { background: var(--vscode-editorWarning-foreground, #cca700); }
  .ctx-fill.danger { background: var(--vscode-editorError-foreground, #f14c4c); }
  .ctx-note { font-size: 10px; color: var(--vscode-descriptionForeground); font-style: italic; white-space: nowrap; }

  /* ── Main split — vertical stack ─────────────────── */
  .main { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

  /* ── Editor ──────────────────────────────────────── */
  .editor-wrap {
    height: 35vh; min-height: 140px; max-height: 50vh;
    overflow-y: auto; padding: 10px 12px; box-sizing: border-box;
    border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0;
  }
  /* Grid stacking: overlay and textarea share the same cell — no position sync needed */
  .editor-inner { display: grid; }
  .editor-inner > * { grid-area: 1 / 1; }
  .overlay, textarea {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px; line-height: 1.65;
    white-space: pre-wrap; word-wrap: break-word;
    padding: 0; margin: 0; border: none;
    width: 100%; box-sizing: border-box;
    min-height: 80px; align-self: start;
  }
  textarea {
    background: transparent; color: var(--vscode-editor-foreground);
    resize: none; outline: none; overflow: hidden;
    caret-color: var(--vscode-editorCursor-foreground, #fff);
    z-index: 2;
  }
  .overlay { color: transparent; pointer-events: none; z-index: 1; overflow: hidden; }
  mark.flag-filler {
    background: transparent;
    border-bottom: 2px dotted var(--vscode-descriptionForeground);
    border-radius: 1px;
  }
  mark.flag-redundancy {
    background: rgba(204,167,0,0.15);
    border-bottom: 2px solid var(--vscode-editorWarning-foreground, #cca700);
    border-radius: 1px;
  }
  mark.flag-oversized-code {
    background: rgba(241,76,76,0.08);
    border-bottom: 2px dashed var(--vscode-editorError-foreground, #f14c4c);
    border-radius: 1px;
  }
  mark.flag-semantic-redundancy {
    background: rgba(204,167,0,0.12);
    border-bottom: 2px solid var(--vscode-editorWarning-foreground, #cca700);
    border-radius: 1px;
    text-decoration: line-through;
    text-decoration-color: rgba(204,167,0,0.45);
  }
  mark.flag-structural {
    background: rgba(127,127,127,0.10);
    border-bottom: 2px dotted var(--vscode-descriptionForeground);
    border-radius: 1px;
  }
  mark.flag-sensitive {
    background: rgba(241,76,76,0.12);
    border-bottom: 2px solid var(--vscode-editorError-foreground, #f14c4c);
    border-radius: 1px;
  }

  /* ── Sidebar — now fills width below the editor ──── */
  .sidebar { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  /* Compact stats strip (replaces circular gauge) */
  .gauge-header {
    padding: 7px 12px 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .gauge-wrap  { display: none; } /* hidden — no space for circular gauge */
  .gauge-info  { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 8px; }
  .gauge-info .gi-row {
    font-size: 11px; display: flex; flex-direction: column; gap: 1px;
  }
  .gauge-info .gi-label { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .gauge-info .gi-val   { font-weight: 700; font-size: 12px; }
  .gauge-info .gi-save  { color: var(--vscode-charts-green, #89d185); font-weight: 700; font-size: 12px; }
  .gauge-info .gi-flags { color: var(--vscode-editorWarning-foreground, #cca700); font-weight: 700; font-size: 12px; }
  .gauge-info .gi-divider { display: none; } /* grid layout replaces divider */
  /* token count spans full width as the headline number */
  .gauge-info .gi-tok-row {
    grid-column: 1 / -1;
    display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px;
  }
  .gauge-tok-num { font-size: 22px; font-weight: 700; line-height: 1; font-family: var(--vscode-editor-font-family); }
  .gauge-tok-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  /* context window progress bar inside the strip */
  .gauge-ctx-bar { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: rgba(127,127,127,0.18); margin: 3px 0 4px; overflow: hidden; }
  .gauge-ctx-fill { height: 100%; border-radius: 2px; background: var(--vscode-charts-green, #89d185); transition: width 0.4s; }
  .gauge-ctx-fill.warn   { background: var(--vscode-editorWarning-foreground, #cca700); }
  .gauge-ctx-fill.danger { background: var(--vscode-editorError-foreground, #f14c4c); }
  .gi-complexity.simple  { color: var(--vscode-charts-green, #89d185); }
  .gi-complexity.moderate{ color: var(--vscode-foreground); }
  .gi-complexity.complex { color: var(--vscode-editorWarning-foreground, #cca700); }
  .gi-complexity.high    { color: var(--vscode-editorError-foreground, #f14c4c); }

  /* Tabs */
  .tab-bar { display: flex; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  .tab {
    flex: 1; padding: 7px 4px; text-align: center;
    font-size: 11px; cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--vscode-descriptionForeground);
    user-select: none; transition: color 0.15s;
  }
  .tab:hover { color: var(--vscode-foreground); }
  .tab.active {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder, #007fd4);
    font-weight: 600;
  }
  .tab-panel { flex: 1; overflow-y: auto; padding: 12px; display: none; }
  .tab-panel.active { display: block; }

  /* ── Empty state ─────────────────────────────────── */
  .empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 24px 12px; gap: 8px;
    color: var(--vscode-descriptionForeground); text-align: center;
  }
  .empty-icon { font-size: 28px; opacity: 0.4; }
  .empty-text { font-size: 12px; line-height: 1.6; }

  /* ── Issues tab ──────────────────────────────────── */
  .flag-item {
    display: flex; gap: 9px; align-items: flex-start;
    padding: 9px 10px; margin-bottom: 7px; border-radius: 5px;
    font-size: 12px; line-height: 1.5;
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07));
    border: 1px solid transparent;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .flag-item.info    { border-color: rgba(127,127,127,0.2); }
  .flag-item.warning { border-color: rgba(204,167,0,0.35); }
  .flag-badge {
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; flex-shrink: 0; margin-top: 1px;
  }
  .flag-item.info    .flag-badge { background: rgba(127,127,127,0.2); }
  .flag-item.warning .flag-badge { background: rgba(204,167,0,0.25); }
  .flag-body { flex: 1; min-width: 0; }
  .flag-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  .flag-msg  { font-weight: 600; margin-bottom: 3px; word-break: break-word; }
  .flag-sugg { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .flag-remove {
    margin-top: 5px;
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBackground, rgba(127,127,127,0.3));
    color: var(--vscode-foreground);
    border-radius: 3px; padding: 2px 8px;
    font-size: 10px; cursor: pointer; opacity: 0.7;
    font-family: var(--vscode-font-family);
    transition: opacity 0.15s, background 0.15s;
  }
  .flag-remove:hover { opacity: 1; background: rgba(127,127,127,0.15); }

  /* ── Why High tab ────────────────────────────────── */
  .breakdown-wrap { margin-bottom: 14px; }
  .breakdown-lbl  { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
  .breakdown-bar  { display: flex; height: 10px; border-radius: 5px; overflow: hidden; gap: 1px; }
  .seg { height: 100%; transition: flex 0.4s cubic-bezier(.4,0,.2,1); }
  .seg-narrative  { background: var(--vscode-charts-blue, #4e9de0); }
  .seg-code       { background: var(--vscode-charts-purple, #b267e6); }
  .seg-filler     { background: #cca700; }
  .seg-redundancy { background: var(--vscode-charts-red, #f14c4c); }
  .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .leg-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--vscode-descriptionForeground); }
  .leg-dot  { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

  .expl-item {
    padding: 9px 10px; margin-bottom: 8px; border-radius: 5px;
    font-size: 12px; line-height: 1.5;
    border-left: 3px solid var(--vscode-panel-border);
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07));
    animation: fadeIn 0.2s ease;
  }
  .expl-item.positive { border-left-color: var(--vscode-charts-green, #89d185); }
  .expl-item.warning  { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
  .expl-item.info     { border-left-color: var(--vscode-focusBorder, #007fd4); }
  .expl-title  { font-weight: 600; margin-bottom: 4px; }
  .expl-detail { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .expl-save   { font-size: 11px; margin-top: 4px; color: var(--vscode-charts-green, #89d185); }

  /* ── Optimized tab ───────────────────────────────── */
  .opt-header { margin-bottom: 10px; }
  .opt-meta {
    display: flex; align-items: baseline; gap: 8px;
    font-size: 12px; margin-bottom: 8px;
  }
  .opt-tok   { font-weight: 700; font-size: 15px; font-family: var(--vscode-editor-font-family); }
  .opt-saved { color: var(--vscode-charts-green, #89d185); font-size: 12px; }
  .opt-nosave { color: var(--vscode-descriptionForeground); font-size: 11px; }

  /* Diff view */
  .diff-view {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px; line-height: 1.7;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 5px; overflow: hidden;
    margin-bottom: 10px; max-height: 320px; overflow-y: auto;
  }
  .diff-tabs {
    display: flex; border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorGroupHeader-tabsBackground, rgba(127,127,127,0.07));
  }
  .diff-tab {
    padding: 5px 12px; font-size: 11px; cursor: pointer;
    border-bottom: 2px solid transparent;
    color: var(--vscode-descriptionForeground); user-select: none;
  }
  .diff-tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder, #007fd4); font-weight: 600; }
  .diff-pane { display: none; padding: 10px 12px; white-space: pre-wrap; word-wrap: break-word; }
  .diff-pane.active { display: block; }

  /* inline diff markup */
  del.rm {
    background: rgba(241,76,76,0.15);
    color: var(--vscode-editorError-foreground, #f14c4c);
    text-decoration: line-through; border-radius: 2px;
    padding: 0 1px;
  }
  ins.add {
    background: rgba(137,209,133,0.15);
    color: var(--vscode-charts-green, #89d185);
    text-decoration: none; border-radius: 2px;
    padding: 0 1px;
  }

  .opt-actions { display: flex; gap: 8px; margin-bottom: 8px; }
  .opt-note { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; }

  /* ── Similarity warning ──────────────────────────── */
  .sim-card {
    padding: 10px 11px; margin-bottom: 10px; border-radius: 5px;
    background: rgba(204,167,0,0.08);
    border: 1px solid rgba(204,167,0,0.4);
    animation: fadeIn 0.2s ease;
  }
  .sim-header {
    display: flex; align-items: center; gap: 6px;
    font-weight: 600; font-size: 12px; margin-bottom: 6px;
    color: var(--vscode-editorWarning-foreground, #cca700);
  }
  .sim-match {
    padding: 7px 9px; border-radius: 4px; margin-bottom: 6px;
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07));
    font-size: 11px; line-height: 1.5;
  }
  .sim-match-meta {
    display: flex; justify-content: space-between;
    color: var(--vscode-descriptionForeground); margin-bottom: 3px; font-size: 10px;
  }
  .sim-badge {
    display: inline-block; padding: 1px 6px; border-radius: 10px; font-weight: 700;
    font-size: 10px; background: rgba(204,167,0,0.25);
    color: var(--vscode-editorWarning-foreground, #cca700);
  }
  .sim-excerpt { color: var(--vscode-foreground); word-break: break-word; }
  .sim-actions { display: flex; gap: 6px; margin-top: 6px; }
  .sim-btn {
    font-size: 11px; padding: 3px 9px; border-radius: 3px; cursor: pointer; border: none;
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .sim-btn:hover { background: rgba(127,127,127,0.25); }

  /* ── History tab ─────────────────────────────────── */
  .history-toolbar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
  }
  .history-title { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; }
  .hist-clear { font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer; border: none;
    font-family: var(--vscode-font-family);
    background: transparent; color: var(--vscode-descriptionForeground);
  }
  .hist-clear:hover { color: var(--vscode-editorError-foreground, #f14c4c); }

  .hist-item {
    padding: 9px 10px; margin-bottom: 7px; border-radius: 5px;
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.07));
    border: 1px solid var(--vscode-panel-border);
    font-size: 12px; line-height: 1.5;
    animation: fadeIn 0.15s ease;
  }
  .hist-meta {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 10px; color: var(--vscode-descriptionForeground); margin-bottom: 4px;
  }
  .hist-time { }
  .hist-tok  { font-weight: 600; }
  .hist-excerpt { color: var(--vscode-foreground); word-break: break-word; margin-bottom: 6px; }
  .hist-load {
    font-size: 11px; padding: 3px 9px; border-radius: 3px; cursor: pointer; border: none;
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-secondaryBackground, rgba(127,127,127,0.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .hist-load:hover { background: rgba(127,127,127,0.25); }
</style>
</head>
<body>
<div class="container">

  <!-- ── Toolbar ── -->
  <div class="toolbar">
    <span class="brand"><span class="brand-icon">🏋</span> Prompt Gym</span>
    <select class="model-select" id="modelSel">
      <optgroup label="OpenAI">
        <option value="gpt-4o" selected>GPT-4o</option>
        <option value="gpt-4o-mini">GPT-4o Mini</option>
        <option value="gpt-4-1">GPT-4.1</option>
        <option value="o3">o3</option>
      </optgroup>
      <optgroup label="Microsoft">
        <option value="copilot">GitHub Copilot</option>
      </optgroup>
      <optgroup label="Anthropic">
        <option value="claude-sonnet-4">Claude Sonnet 4</option>
        <option value="claude-haiku-3-5">Claude Haiku 3.5</option>
        <option value="claude-opus-4">Claude Opus 4</option>
      </optgroup>
      <optgroup label="Google">
        <option value="gemini-2-5-flash">Gemini 2.5 Flash</option>
        <option value="gemini-2-5-pro">Gemini 2.5 Pro</option>
      </optgroup>
    </select>
    <div class="stats">
      <button class="btn sec" id="btnCopy">Copy prompt</button>
      <button class="btn"     id="btnCopyOpt">Copy optimized</button>
    </div>
  </div>

  <!-- ── Monthly budget bar ── -->
  <div class="ctx-bar">
    <div class="ctx-label" id="ctxLabel">0 / 400K monthly budget — GPT-4o</div>
    <div class="ctx-track"><div class="ctx-fill" id="ctxFill" style="width:0%"></div></div>
    <div class="ctx-note" id="ctxNote"></div>
  </div>

  <!-- ── Main ── -->
  <div class="main">

    <!-- Editor -->
    <div class="editor-wrap">
      <div class="editor-inner">
        <div class="overlay" id="overlay"></div>
        <textarea id="input"
        placeholder="Draft your prompt here — everything runs locally, no API key needed.

Paste code, write your question, add context. Token count updates live against the selected model's context window."
        spellcheck="false"></textarea>
      </div>
    </div>

    <!-- Sidebar -->
    <div class="sidebar">

      <!-- Compact stats strip -->
      <div class="gauge-header">
        <div class="gauge-info">
          <!-- headline token count -->
          <div class="gi-tok-row">
            <span class="gauge-tok-num" id="gaugeTok">0</span>
            <span class="gauge-tok-label">tokens</span>
          </div>
          <!-- context window bar -->
          <div class="gauge-ctx-bar">
            <div class="gauge-ctx-fill" id="gaugeFill" style="width:0%"></div>
          </div>
          <!-- 3-column stats grid -->
          <div class="gi-row">
            <span class="gi-label">Flags</span>
            <span class="gi-flags" id="giFlags">0</span>
          </div>
          <div class="gi-row">
            <span class="gi-label">Savable</span>
            <span class="gi-save" id="giSave">—</span>
          </div>
          <div class="gi-row">
            <span class="gi-label">After cleanup</span>
            <span class="gi-val" id="giOpt">—</span>
          </div>
          <div class="gi-row">
            <span class="gi-label">Est. response</span>
            <span class="gi-val gi-complexity" id="giResp">—</span>
          </div>
          <div class="gi-row">
            <span class="gi-label">Est. total</span>
            <span class="gi-val" id="giTotal">—</span>
          </div>
          <div class="gi-row" style="grid-column:1/-1">
            <span class="gi-label" id="ctxPctLabel" style="color:var(--vscode-descriptionForeground)"></span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tab-bar">
        <div class="tab active" data-tab="issues">Issues</div>
        <div class="tab"        data-tab="whyhigh">Why High?</div>
        <div class="tab"        data-tab="optimized">Optimized</div>
        <div class="tab"        data-tab="history" id="historyTab">History</div>
      </div>

      <div class="tab-panel active" id="tab-issues">
        <div id="flagList">
          <div class="empty">
            <div class="empty-icon">✦</div>
            <div class="empty-text">Start typing — issues appear here as you write.</div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="tab-whyhigh">
        <div id="whyHigh">
          <div class="empty">
            <div class="empty-icon">📊</div>
            <div class="empty-text">Type or paste a prompt to see the token breakdown.</div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="tab-optimized">
        <div id="optimized">
          <div class="empty">
            <div class="empty-icon">✨</div>
            <div class="empty-text">A cleaned version of your prompt appears here after analysis.</div>
          </div>
        </div>
      </div>

      <div class="tab-panel" id="tab-history">
        <div id="historyList">
          <div class="empty">
            <div class="empty-icon">🕑</div>
            <div class="empty-text">No prompt history yet. Copy a prompt to start tracking.</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode      = acquireVsCodeApi();
  const input       = document.getElementById('input');
  const overlay     = document.getElementById('overlay');
  const ctxLabel    = document.getElementById('ctxLabel');
  const ctxFill     = document.getElementById('ctxFill');
  const ctxNote     = document.getElementById('ctxNote');
  const gaugeFill   = document.getElementById('gaugeFill');
  const gaugeTok    = document.getElementById('gaugeTok');
  const giFlags     = document.getElementById('giFlags');
  const giSave      = document.getElementById('giSave');
  const giOpt       = document.getElementById('giOpt');
  const flagList    = document.getElementById('flagList');
  const whyHigh     = document.getElementById('whyHigh');
  const optimized   = document.getElementById('optimized');
  const historyList = document.getElementById('historyList');
  const modelSel    = document.getElementById('modelSel');
  const btnCopy     = document.getElementById('btnCopy');
  const btnCopyOpt  = document.getElementById('btnCopyOpt');

  let debounce = null;
  let lastOptimized = '';

  // ── Utilities ──────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmt(n) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\\.0$/,'')+'M';
    if (n >= 1_000)     return Math.round(n/1_000)+'K';
    return String(n);
  }

  // ── Tabs ───────────────────────────────────────────

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      // Fetch history lazily when tab is first opened
      if (tab.dataset.tab === 'history') {
        vscode.postMessage({ type: 'getHistory' });
      }
    });
  });

  // ── Model selector ─────────────────────────────────

  modelSel.addEventListener('change', () => {
    vscode.postMessage({ type: 'modelChange', modelId: modelSel.value });
  });

  // ── Editor overlay ─────────────────────────────────

  function renderOverlay(text, flags) {
    if (!flags || !flags.length) { overlay.innerHTML = esc(text); return; }
    let out = '', cursor = 0;
    const sorted = [...flags].filter(f => f.end > f.start).sort((a,b) => a.start - b.start);
    for (const f of sorted) {
      if (f.start < cursor) continue;
      out += esc(text.slice(cursor, f.start));
      out += '<mark class="flag-' + f.type + '">' + esc(text.slice(f.start, f.end)) + '</mark>';
      cursor = f.end;
    }
    out += esc(text.slice(cursor));
    overlay.innerHTML = out;
  }

  input.addEventListener('input', () => {
    renderOverlay(input.value, []);
    clearTimeout(debounce);
    debounce = setTimeout(() => vscode.postMessage({ type: 'analyze', text: input.value }), 350);
  });

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }
  input.addEventListener('input', autoResize);

  // ── Copy ───────────────────────────────────────────

  btnCopy.addEventListener('click', () => vscode.postMessage({ type: 'copy', text: input.value }));
  btnCopyOpt.addEventListener('click', () => {
    if (lastOptimized) vscode.postMessage({ type: 'copyOptimized', text: lastOptimized });
  });

  // ── Gauge ──────────────────────────────────────────

  function updateGauge(tokenCount, pct, flags, optimizedTokenCount, complexity) {
    gaugeTok.textContent = fmt(tokenCount);
    giFlags.textContent  = String(flags.length);
    giSave.textContent   = flags.reduce((s,f)=>s+(f.tokenImpact||0),0) > 0
      ? '~' + flags.reduce((s,f)=>s+(f.tokenImpact||0),0) + ' tok'
      : '—';
    giOpt.textContent = tokenCount > 0 ? fmt(optimizedTokenCount) + ' tok' : '—';

    const giResp  = document.getElementById('giResp');
    const giTotal = document.getElementById('giTotal');
    if (complexity && tokenCount > 0) {
      giResp.textContent  = '~' + fmt(complexity.estimatedResponseTokens) + ' tok';
      giTotal.textContent = '~' + fmt(complexity.totalEstimatedTokens) + ' tok';
      giResp.className = 'gi-val gi-complexity ' + complexity.label;
    } else {
      if (giResp)  giResp.textContent  = '—';
      if (giTotal) giTotal.textContent = '—';
    }

    // Context window progress bar (replaces circular gauge)
    const clamped = Math.min(pct, 100);
    gaugeFill.style.width = clamped + '%';
    gaugeFill.classList.remove('warn','danger');
    if      (clamped >= 95) gaugeFill.classList.add('danger');
    else if (clamped >= 80) gaugeFill.classList.add('warn');

    const ctxPctLabel = document.getElementById('ctxPctLabel');
    if (ctxPctLabel) {
      ctxPctLabel.textContent = pct > 0
        ? Math.round(pct * 10) / 10 + '% of context window'
        : '';
    }
  }

  // ── Context bar (cumulative monthly budget) ────────

  function updateCtxBar(result) {
    const {
      tokenCount, modelLabel, tokenizerNote,
      monthlyUsage = 0, monthlyBudget = 400_000, monthlyPercent = 0,
    } = result;

    // Cumulative fill: tokens already sent this month
    const usedPct    = Math.min(100, monthlyPercent);
    // Additional slice: current unsent prompt
    const promptPct  = Math.min(100 - usedPct, (tokenCount / monthlyBudget) * 100);
    const totalPct   = Math.min(100, usedPct + promptPct);

    const usedStr = monthlyPercent < 0.01 ? '<0.01'
      : monthlyPercent < 1 ? monthlyPercent.toFixed(2)
      : monthlyPercent.toFixed(1);

    const resetNote = ' · resets 1st';
    ctxLabel.textContent =
      'Month to date: ' + fmt(monthlyUsage) + ' / ' + fmt(monthlyBudget) + ' (' + usedStr + '%)' + resetNote +
      (tokenCount > 0 ? '  ·  +' + fmt(tokenCount) + ' this prompt  ·  ' + modelLabel : '  ·  ' + modelLabel);

    ctxFill.style.width = Math.max(totalPct > 0 ? 0.4 : 0, totalPct) + '%';
    ctxFill.classList.remove('warn', 'danger');
    if      (totalPct >= 90) ctxFill.classList.add('danger');
    else if (totalPct >= 70) ctxFill.classList.add('warn');

    ctxNote.textContent = tokenizerNote ?? '';
  }

  // ── Relative time ──────────────────────────────────

  function relTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    if (h < 24) return h + 'h ago';
    if (d === 1) return 'yesterday';
    return d + ' days ago';
  }

  // ── Similarity warning ─────────────────────────────

  function renderSimilarWarning(similarPrompts) {
    if (!similarPrompts || !similarPrompts.length) { return ''; }
    let html = '<div class="sim-card">';
    html += '<div class="sim-header">⚡ Similar to a recent prompt</div>';
    similarPrompts.forEach(({ record, similarity }) => {
      const pct = Math.round(similarity * 100);
      const excerpt = record.text.length > 120
        ? record.text.slice(0, 120) + '…'
        : record.text;
      html += '<div class="sim-match">';
      html += '<div class="sim-match-meta">';
      html += '<span>' + relTime(record.timestamp) + ' · ' + record.tokenCount + ' tokens</span>';
      html += '<span class="sim-badge">' + pct + '% match</span>';
      html += '</div>';
      html += '<div class="sim-excerpt">' + esc(excerpt) + '</div>';
      html += '<div class="sim-actions">';
      html += '<button class="sim-btn" data-action="load-prompt" data-text="' + JSON.stringify(record.text).replace(/"/g, '&quot;') + '">Load it</button>';
      html += '</div>';
      html += '</div>';
    });
    html += '<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">You may have already sent this — sending again will consume more of your token budget.</div>';
    html += '</div>';
    return html;
  }

  // ── Issues ─────────────────────────────────────────

  const TYPE_META = {
    filler:                { label: 'Filler phrase',        icon: '○',   sev: 'info',    removable: true  },
    redundancy:            { label: 'Repeated context',     icon: '⟳',   sev: 'warning', removable: true  },
    'semantic-redundancy': { label: 'Semantic duplicate',   icon: '≈',   sev: 'warning', removable: true  },
    structural:            { label: 'Structural issue',     icon: '⊞',   sev: 'info',    removable: true  },
    'oversized-code':      { label: 'Oversized code',       icon: '{ }', sev: 'warning', removable: false },
    sensitive:             { label: 'Sensitive data',       icon: '⚠',   sev: 'warning', removable: false },
    threshold:             { label: 'Token threshold',      icon: '⚠',   sev: 'warning', removable: false },
  };

  function renderFlags(flags, similarPrompts) {
    let html = renderSimilarWarning(similarPrompts);
    if (!flags.length) {
      html += '<div class="empty"><div class="empty-icon">✓</div>' +
        '<div class="empty-text">No issues — prompt looks clean.</div></div>';
      flagList.innerHTML = html;
      return;
    }
    html += flags.map(f => {
      const m = TYPE_META[f.type] || { label: f.type, icon: '·', sev: f.severity, removable: false };
      const removeBtn = m.removable && f.end > f.start
        ? '<button class="flag-remove" data-action="apply-fix" data-start="' + f.start + '" data-end="' + f.end + '">Remove</button>'
        : '';
      return '<div class="flag-item ' + f.severity + '">' +
        '<div class="flag-badge">' + m.icon + '</div>' +
        '<div class="flag-body">' +
          '<div class="flag-type">' + m.label + '</div>' +
          '<div class="flag-msg">'  + esc(f.message) + '</div>' +
          (f.suggestion ? '<div class="flag-sugg">' + esc(f.suggestion) + '</div>' : '') +
          removeBtn +
        '</div></div>';
    }).join('');
    flagList.innerHTML = html;
  }

  // ── Why High? ──────────────────────────────────────

  function renderWhyHigh(result) {
    const { breakdown, explanations, tokenCount } = result;
    if (!tokenCount) {
      whyHigh.innerHTML =
        '<div class="empty"><div class="empty-icon">📊</div>' +
        '<div class="empty-text">Type or paste a prompt to see the token breakdown.</div></div>';
      return;
    }
    const total = breakdown.total || 1;
    const narF  = Math.max(0, breakdown.fromNarrative);
    const codeF = breakdown.fromCodeBlocks;
    const fillF = breakdown.fromFillerPhrases;
    const redF  = breakdown.fromRedundantContext;
    const pct   = n => Math.round(n / total * 100);

    let html = '<div class="breakdown-wrap">';
    html += '<div class="breakdown-lbl">Token composition — ' + fmt(tokenCount) + ' total</div>';
    html += '<div class="breakdown-bar">';
    if (narF  > 0) html += '<div class="seg seg-narrative"  style="flex:' + narF  + '"></div>';
    if (codeF > 0) html += '<div class="seg seg-code"       style="flex:' + codeF + '"></div>';
    if (fillF > 0) html += '<div class="seg seg-filler"     style="flex:' + fillF + '"></div>';
    if (redF  > 0) html += '<div class="seg seg-redundancy" style="flex:' + redF  + '"></div>';
    html += '</div><div class="legend">';
    if (narF  > 0) html += '<div class="leg-item"><div class="leg-dot seg-narrative"></div>Narrative '  + pct(narF)  + '%</div>';
    if (codeF > 0) html += '<div class="leg-item"><div class="leg-dot seg-code"></div>Code '            + pct(codeF) + '%</div>';
    if (fillF > 0) html += '<div class="leg-item"><div class="leg-dot seg-filler"></div>Filler '        + pct(fillF) + '%</div>';
    if (redF  > 0) html += '<div class="leg-item"><div class="leg-dot seg-redundancy"></div>Repeated '  + pct(redF)  + '%</div>';
    html += '</div></div>';

    explanations.forEach(ex => {
      html += '<div class="expl-item ' + ex.type + '">' +
        '<div class="expl-title">'  + esc(ex.title)  + '</div>' +
        '<div class="expl-detail">' + esc(ex.detail) + '</div>' +
        (ex.savable > 0 ? '<div class="expl-save">Potential saving: ~' + ex.savable + ' tokens</div>' : '') +
        '</div>';
    });

    // ── Response complexity card ──
    const cx = result.complexity;
    if (cx) {
      const COMPLEXITY_COLOR = { simple: 'positive', moderate: 'info', complex: 'warning', high: 'warning' };
      const COMPLEXITY_DESC  = {
        simple:   'Short factual or yes/no response expected.',
        moderate: 'Prose or list response expected.',
        complex:  'Multi-section response with code or detailed explanation expected.',
        high:     'Full code generation or implementation — response will likely be much larger than the prompt.',
      };
      html += '<div class="expl-item ' + (COMPLEXITY_COLOR[cx.label] || 'info') + '">' +
        '<div class="expl-title">Response complexity: ' + cx.label.charAt(0).toUpperCase() + cx.label.slice(1) +
          ' (~' + fmt(cx.estimatedResponseTokens) + ' response tokens estimated)</div>' +
        '<div class="expl-detail">' + esc(COMPLEXITY_DESC[cx.label]) +
          ' Estimated total cost: <strong>~' + fmt(cx.totalEstimatedTokens) + ' tokens</strong>' +
          ' (' + fmt(tokenCount) + ' prompt + ~' + fmt(cx.estimatedResponseTokens) + ' response).</div>';
      if (cx.signals && cx.signals.length) {
        html += '<div class="expl-detail" style="margin-top:4px;color:var(--vscode-descriptionForeground)">Signals: ' +
          cx.signals.map(s => esc(s)).join(' · ') + '</div>';
      }
      html += '</div>';
    }

    whyHigh.innerHTML = html;
  }

  // ── Optimized (with diff view) ─────────────────────

  function buildDiff(original, optimizedText, flags) {
    // Build a character-level removed-spans list from flags.
    const removable = flags
      .filter(f => (f.type === 'filler' || f.type === 'redundancy') && f.end > f.start)
      .sort((a,b) => a.start - b.start);

    let diffHtml = '';
    let cursor = 0;
    for (const f of removable) {
      if (f.start < cursor) continue;
      diffHtml += esc(original.slice(cursor, f.start));
      diffHtml += '<del class="rm">' + esc(original.slice(f.start, f.end)) + '</del>';
      cursor = f.end;
    }
    diffHtml += esc(original.slice(cursor));
    return diffHtml;
  }

  function renderOptimized(result) {
    const { optimizedPrompt, optimizedTokenCount, tokenCount, flags } = result;
    lastOptimized = optimizedPrompt;

    if (!tokenCount) {
      optimized.innerHTML =
        '<div class="empty"><div class="empty-icon">✨</div>' +
        '<div class="empty-text">A cleaned version of your prompt appears here after analysis.</div></div>';
      return;
    }

    const saved    = tokenCount - optimizedTokenCount;
    const savedPct = tokenCount > 0 ? Math.round(saved / tokenCount * 100) : 0;
    const noChange = saved <= 0;

    let html = '<div class="opt-header">';
    html += '<div class="opt-meta">';
    html += '<span class="opt-tok">' + fmt(optimizedTokenCount) + ' tokens</span>';
    if (saved > 0) {
      html += '<span class="opt-saved">−' + saved + ' (' + savedPct + '% leaner)</span>';
    } else {
      html += '<span class="opt-nosave">No changes — already clean</span>';
    }
    html += '</div></div>';

    if (!noChange) {
      // Diff view with two tabs: Diff | Clean
      const diffHtml  = buildDiff(input.value, optimizedPrompt, flags);
      const cleanHtml = esc(optimizedPrompt);

      html += '<div class="diff-view">';
      html += '<div class="diff-tabs">';
      html += '<div class="diff-tab active" data-pane="diff">Diff</div>';
      html += '<div class="diff-tab" data-pane="clean">Clean</div>';
      html += '</div>';
      html += '<div class="diff-pane active" id="pane-diff">'  + diffHtml  + '</div>';
      html += '<div class="diff-pane"         id="pane-clean">' + cleanHtml + '</div>';
      html += '</div>';

      html += '<div class="opt-actions">';
      html += '<button class="btn" id="btnCopyOptInline">Copy optimized</button>';
      html += '</div>';
      html += '<div class="opt-note">Filler and repeated context removed. Review before sending.</div>';
    }

    optimized.innerHTML = html;

    // Wire up diff sub-tabs
    optimized.querySelectorAll('.diff-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        optimized.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('active'));
        optimized.querySelectorAll('.diff-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = optimized.querySelector('#pane-' + tab.dataset.pane);
        if (pane) pane.classList.add('active');
      });
    });

    const inline = document.getElementById('btnCopyOptInline');
    if (inline) {
      inline.addEventListener('click', () => {
        if (lastOptimized) vscode.postMessage({ type: 'copyOptimized', text: lastOptimized });
      });
    }
  }

  // ── History tab ────────────────────────────────────

  function renderHistory(records) {
    if (!records || !records.length) {
      historyList.innerHTML =
        '<div class="empty"><div class="empty-icon">🕑</div>' +
        '<div class="empty-text">No prompt history yet. Copy a prompt to start tracking.</div></div>';
      return;
    }
    let html = '<div class="history-toolbar">';
    html += '<span class="history-title">' + records.length + ' saved prompt' + (records.length === 1 ? '' : 's') + '</span>';
    html += '<button class="hist-clear" data-action="clear-history">Clear all</button>';
    html += '</div>';
    html += records.map(r => {
      const excerpt = r.text.length > 140 ? r.text.slice(0, 140) + '…' : r.text;
      return '<div class="hist-item">' +
        '<div class="hist-meta">' +
          '<span class="hist-time">' + relTime(r.timestamp) + '</span>' +
          '<span class="hist-tok">' + r.tokenCount + ' tokens</span>' +
        '</div>' +
        '<div class="hist-excerpt">' + esc(excerpt) + '</div>' +
        '<button class="hist-load" data-action="load-prompt" data-text="' + JSON.stringify(r.text).replace(/"/g, '&quot;') + '">Load into editor</button>' +
        '</div>';
    }).join('');
    historyList.innerHTML = html;
  }

  // ── Delegated action handler (replaces all onclick= attributes) ────────────

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) { return; }
    const action = btn.dataset.action;

    if (action === 'clear-history') {
      vscode.postMessage({ type: 'clearHistory' });
      return;
    }
    if (action === 'load-prompt') {
      const text = JSON.parse(btn.dataset.text ?? '""');
      vscode.postMessage({ type: 'loadPrompt', text });
      return;
    }
    if (action === 'apply-fix') {
      const flagStart = parseInt(btn.dataset.start ?? '0', 10);
      const flagEnd   = parseInt(btn.dataset.end   ?? '0', 10);
      vscode.postMessage({ type: 'applyFix', flagStart, flagEnd });
      return;
    }
  });

  // ── Message handler ────────────────────────────────

  window.addEventListener('message', ({ data }) => {
    if (data.type === 'analysisResult') {
      const r = data.result;
      updateGauge(r.tokenCount, r.contextWindowPercent, r.flags, r.optimizedTokenCount, r.complexity);
      updateCtxBar(r);
      renderOverlay(input.value, r.flags);
      renderFlags(r.flags, r.similarPrompts);
      renderWhyHigh(r);
      renderOptimized(r);
      // Update history badge if similar prompts found
      const histTab = document.getElementById('historyTab');
      if (histTab) {
        histTab.textContent = r.similarPrompts && r.similarPrompts.length
          ? 'History ⚡'
          : 'History';
      }
      return;
    }
    if (data.type === 'historyData') {
      renderHistory(data.records);
      return;
    }
    if (data.type === 'setPrompt') {
      input.value = data.text;
      autoResize();
      renderOverlay(input.value, []);
      vscode.postMessage({ type: 'analyze', text: input.value });
      // Switch to Issues tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="issues"]').classList.add('active');
      document.getElementById('tab-issues').classList.add('active');
    }
  });
</script>
</body>
</html>`;
}
