import * as vscode from 'vscode';
import {
  analyzePrompt,
  countTokens,
  AnalysisConfig,
  DEFAULT_CONFIG,
  DEFAULT_MODEL_ID,
  MODELS,
} from './analyzer';
import { HistoryStore, SimilarMatch } from './history';
import { getWebviewHtml } from './webviewContent';

let currentWebview: vscode.Webview | undefined;
let lastPromptText = '';
let selectedModelId = DEFAULT_MODEL_ID;
let historyStore: HistoryStore;
let statusBarItem: vscode.StatusBarItem;
let statusBarDebounce: ReturnType<typeof setTimeout> | undefined;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function readConfig(): AnalysisConfig {
  const cfg = vscode.workspace.getConfiguration('promptGym');
  return {
    tokenizerModel: cfg.get('tokenizerModel', DEFAULT_CONFIG.tokenizerModel),
    tokenWarningThreshold: cfg.get(
      'tokenWarningThreshold',
      DEFAULT_CONFIG.tokenWarningThreshold,
    ),
    pastedCodeTokenThreshold: cfg.get(
      'pastedCodeTokenThreshold',
      DEFAULT_CONFIG.pastedCodeTokenThreshold,
    ),
    selectedModelId,
  };
}

function readMonthlyBudget(): number {
  return vscode.workspace.getConfiguration('promptGym').get('monthlyTokenBudget', 400_000);
}

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

function updateStatusBarForEditor(editor: vscode.TextEditor | undefined) {
  if (!editor) { statusBarItem.hide(); return; }
  const cfg = readConfig();
  const selection = editor.selection;
  const text = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);
  const tokens = countTokens(text, cfg.tokenizerModel);
  const suffix = selection.isEmpty ? '' : ' sel';
  statusBarItem.text = `$(beaker) ${tokens} tok${suffix}`;
  statusBarItem.tooltip = selection.isEmpty
    ? `Prompt Gym: ${tokens} tokens in document — click to open`
    : `Prompt Gym: ${tokens} tokens selected — click to open`;
  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function runAnalysis() {
  if (!currentWebview) { return; }

  const config = readConfig();
  const result = analyzePrompt(lastPromptText, config);

  const similarPrompts: SimilarMatch[] = lastPromptText.trim()
    ? historyStore.findSimilar(lastPromptText)
    : [];

  const MONTHLY_BUDGET = readMonthlyBudget();
  const monthlyUsage   = historyStore.getMonthlyUsage();

  currentWebview.postMessage({
    type: 'analysisResult',
    result: {
      ...result,
      similarPrompts,
      monthlyUsage,
      monthlyBudget: MONTHLY_BUDGET,
      monthlyPercent: (monthlyUsage / MONTHLY_BUDGET) * 100,
    },
  });

  statusBarItem.text = `$(beaker) ${result.tokenCount} tok (gym)`;
  statusBarItem.tooltip = `Prompt Gym: ${result.tokenCount} tokens · ${result.optimizedTokenCount} after cleanup`;
  statusBarItem.show();
}

// ---------------------------------------------------------------------------
// Message handler (shared between sidebar view and any future panel)
// ---------------------------------------------------------------------------

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {

    case 'analyze': {
      lastPromptText = (message.text as string) ?? '';
      runAnalysis();
      break;
    }

    case 'modelChange': {
      const id = (message.modelId as string) ?? DEFAULT_MODEL_ID;
      if (MODELS[id]) { selectedModelId = id; }
      runAnalysis();
      break;
    }

    case 'copy': {
      const text = (message.text as string) ?? '';
      lastPromptText = text;
      await vscode.env.clipboard.writeText(text);
      const cfg = readConfig();
      const r = analyzePrompt(text, cfg);
      await historyStore.add(text, r.tokenCount);
      vscode.window.showInformationMessage('Prompt copied to clipboard — paste it into your LLM.');
      break;
    }

    case 'copyOptimized': {
      const optimized = (message.text as string) ?? '';
      await vscode.env.clipboard.writeText(optimized);
      const cfg2 = readConfig();
      const r2 = analyzePrompt(optimized, cfg2);
      await historyStore.add(optimized, r2.tokenCount);
      vscode.window.showInformationMessage('Optimized prompt copied — filler and redundancy removed.');
      break;
    }

    case 'getHistory': {
      currentWebview?.postMessage({ type: 'historyData', records: historyStore.getAll() });
      break;
    }

    case 'clearHistory': {
      await historyStore.clear();
      currentWebview?.postMessage({ type: 'historyData', records: [] });
      vscode.window.showInformationMessage('Prompt history cleared.');
      break;
    }

    case 'loadPrompt': {
      currentWebview?.postMessage({ type: 'setPrompt', text: message.text });
      break;
    }

    case 'applyFix': {
      const { flagStart, flagEnd } = message as unknown as { flagStart: number; flagEnd: number };
      if (
        typeof flagStart === 'number' &&
        typeof flagEnd   === 'number' &&
        flagEnd > flagStart &&
        flagStart >= 0 &&
        flagEnd <= lastPromptText.length
      ) {
        lastPromptText = (
          lastPromptText.slice(0, flagStart) + lastPromptText.slice(flagEnd)
        )
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trimStart();
        currentWebview?.postMessage({ type: 'setPrompt', text: lastPromptText });
        runAnalysis();
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar WebviewViewProvider
// ---------------------------------------------------------------------------

class PromptGymViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptGym.mainView';

  private _view?: vscode.WebviewView;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    webviewView.webview.html = getWebviewHtml(nonce);

    currentWebview = webviewView.webview;

    webviewView.webview.onDidReceiveMessage(handleMessage, null, this._context.subscriptions);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        currentWebview = webviewView.webview;
        if (lastPromptText) { runAnalysis(); }
      } else {
        // Restore editor token count while sidebar is hidden
        updateStatusBarForEditor(vscode.window.activeTextEditor);
      }
    });

    webviewView.onDidDispose(() => {
      if (currentWebview === webviewView.webview) {
        currentWebview = undefined;
        updateStatusBarForEditor(vscode.window.activeTextEditor);
      }
    });
  }

  public focus() {
    this._view?.show(true);
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  historyStore = new HistoryStore(context.globalState);

  // ── Status bar ────────────────────────────────────

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'promptGym.open';
  updateStatusBarForEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (currentWebview) { return; }
      updateStatusBarForEditor(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (currentWebview) { return; }
      clearTimeout(statusBarDebounce);
      statusBarDebounce = setTimeout(() => updateStatusBarForEditor(e.textEditor), 200);
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (currentWebview) { return; }
      if (vscode.window.activeTextEditor?.document !== e.document) { return; }
      clearTimeout(statusBarDebounce);
      statusBarDebounce = setTimeout(
        () => updateStatusBarForEditor(vscode.window.activeTextEditor), 300,
      );
    }),
  );

  // ── Sidebar view provider ─────────────────────────

  const viewProvider = new PromptGymViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PromptGymViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // ── Open command — focuses the sidebar ────────────

  const openCommand = vscode.commands.registerCommand('promptGym.open', () => {
    vscode.commands.executeCommand('promptGym.mainView.focus');
  });

  // ── Copy-optimised command (palette shortcut) ─────

  const copyOptCommand = vscode.commands.registerCommand(
    'promptGym.copyOptimized',
    async () => {
      if (!lastPromptText) {
        vscode.window.showWarningMessage('No prompt drafted yet — open Prompt Gym first.');
        return;
      }
      const config = readConfig();
      const result = analyzePrompt(lastPromptText, config);
      await vscode.env.clipboard.writeText(result.optimizedPrompt);
      await historyStore.add(result.optimizedPrompt, result.optimizedTokenCount);
      vscode.window.showInformationMessage('Optimized prompt copied to clipboard.');
    },
  );

  // ── Optimize selection command ─────────────────────

  const optimizeSelectionCommand = vscode.commands.registerCommand(
    'promptGym.optimizeSelection',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor to optimize.');
        return;
      }

      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      if (!text.trim()) {
        vscode.window.showWarningMessage('Nothing to optimize — selection is empty.');
        return;
      }

      const config = readConfig();
      const result = analyzePrompt(text, config);
      const saved  = result.tokenCount - result.optimizedTokenCount;

      if (saved <= 0) {
        vscode.window.showInformationMessage(
          `Prompt Gym: no changes — ${result.tokenCount} tokens, already clean.`,
        );
        return;
      }

      const choice = await vscode.window.showQuickPick(
        [
          {
            label: '$(replace-all) Replace with optimized',
            description: `${result.optimizedTokenCount} tokens (−${saved} saved)`,
            id: 'replace',
          },
          {
            label: '$(copy) Copy optimized to clipboard',
            description: `${result.optimizedTokenCount} tokens`,
            id: 'copy',
          },
          {
            label: '$(beaker) Open in Prompt Gym panel',
            description: 'See full diff and breakdown',
            id: 'panel',
          },
        ],
        {
          title: `Optimize — ${result.tokenCount} → ${result.optimizedTokenCount} tokens (${saved} savable)`,
          placeHolder: 'Choose an action',
        },
      );

      if (!choice) { return; }

      if (choice.id === 'replace') {
        const range = selection.isEmpty
          ? new vscode.Range(
              editor.document.positionAt(0),
              editor.document.positionAt(text.length),
            )
          : selection;
        await editor.edit(eb => eb.replace(range, result.optimizedPrompt));
        vscode.window.showInformationMessage(
          `Prompt Gym: replaced — ${result.optimizedTokenCount} tokens (−${saved} saved).`,
        );
      } else if (choice.id === 'copy') {
        await vscode.env.clipboard.writeText(result.optimizedPrompt);
        vscode.window.showInformationMessage(
          `Optimized prompt copied — ${result.optimizedTokenCount} tokens (−${saved} saved).`,
        );
      } else if (choice.id === 'panel') {
        lastPromptText = text;
        viewProvider.focus();
        setTimeout(() => {
          currentWebview?.postMessage({ type: 'setPrompt', text });
        }, 300);
      }
    },
  );

  // ── Live re-analysis on settings change ───────────

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('promptGym')) { runAnalysis(); }
  });

  context.subscriptions.push(openCommand, copyOptCommand, optimizeSelectionCommand, configListener);
}

export function deactivate() { /* nothing to clean up */ }
