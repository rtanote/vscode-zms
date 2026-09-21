import * as vscode from "vscode";

export class SheetMusicPanel {
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "zmsSheetMusic",
      "ZMS Sheet Music",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "media"),
        ],
      },
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  update(abc: string, velocities: number[] = []): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: "render", abc, velocities });
    }
  }

  /**
   * 譜面上に現在再生中の音符を示す。noteIndex = -1 でハイライトを消す。
   * abcjs が付与する `.abcjs-note` の N 番目にヒットさせる。
   * `color` は音符自体を塗る色 (トラックパレット色を渡す)。省略時は既定色。
   */
  highlight(noteIndex: number, color?: string): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: "highlight", index: noteIndex, color });
    }
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const abcjsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "abcjs-basic-min.js"),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZMS Sheet Music</title>
  <style>
    body {
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      padding: 8px;
      margin: 0;
    }
    #paper svg {
      width: 100%;
      max-width: 800px;
    }
    #paper svg text {
      fill: var(--vscode-editor-foreground, #d4d4d4) !important;
    }
    #paper svg path,
    #paper svg line,
    #paper svg rect.abcjs-staff-extra {
      stroke: var(--vscode-editor-foreground, #d4d4d4) !important;
    }
    #paper svg path.abcjs-fill {
      fill: var(--vscode-editor-foreground, #d4d4d4) !important;
    }
    #info {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      opacity: 0.7;
      margin-top: 4px;
    }
    .empty-msg {
      opacity: 0.5;
      font-style: italic;
      margin-top: 20px;
    }
    /* 再生ヘッドは左寄せ、細く、目立たないグレー */
    #paper svg .playhead {
      fill: var(--vscode-foreground, #888);
      opacity: 0.28;
    }
  </style>
</head>
<body>
  <div id="paper"></div>
  <div id="info"></div>
  <script nonce="${nonce}" src="${abcjsUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const paper = document.getElementById('paper');
    const info = document.getElementById('info');

    function velocityColor(vel) {
      // 青(弱)→緑(中)→赤(強): HSL hue 240→0
      var hue = 240 - (vel / 127) * 240;
      return 'hsl(' + hue + ', 80%, 55%)';
    }

    function drawVelocityBars(velocities) {
      var svg = paper.querySelector('svg');
      if (!svg || !velocities || velocities.length === 0) return;

      var notes = svg.querySelectorAll('.abcjs-note');
      if (notes.length === 0) return;

      // 全描画要素の最下部を基準にする（低い音の符尾等との重なりを回避）
      var svgBB = svg.getBBox();
      var contentBottom = svgBB.y + svgBB.height;

      var barTop = contentBottom + 10;
      var maxBarHeight = 24;
      var barWidth = 6;

      // ベロシティバー用のグループ
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'velocity-bars');

      notes.forEach(function(el, idx) {
        if (idx >= velocities.length) return;
        var vel = velocities[idx];
        var bbox = el.getBBox();
        var barHeight = (vel / 127) * maxBarHeight;
        var x = bbox.x + bbox.width / 2 - barWidth / 2;

        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(barTop + maxBarHeight - barHeight));
        rect.setAttribute('width', String(barWidth));
        rect.setAttribute('height', String(barHeight));
        rect.setAttribute('fill', velocityColor(vel));
        rect.setAttribute('opacity', '0.8');
        g.appendChild(rect);
      });

      svg.appendChild(g);

      // SVG の viewBox を拡張してバーが見切れないように
      var totalHeight = barTop + maxBarHeight + 4;
      var vb = svg.getAttribute('viewBox');
      if (vb) {
        var parts = vb.split(/\\s+|,/);
        var currentH = parseFloat(parts[3]);
        if (totalHeight > currentH) {
          svg.setAttribute('viewBox', parts[0] + ' ' + parts[1] + ' ' + parts[2] + ' ' + totalHeight);
        }
      }
    }

    /**
     * 現在の音符 index に対して再生ヘッドと強調を移す。
     * index=-1 で消去。color 指定でトラック別に音符を塗り分け。
     */
    function setPlayhead(index, color) {
      var svg = paper.querySelector('svg');
      if (!svg) return;
      // 既存 playhead / .playing を全消し + 元 fill を復元
      var old = svg.querySelector('.playhead');
      if (old) old.parentNode.removeChild(old);
      svg.querySelectorAll('.abcjs-note.playing').forEach(function(el) {
        el.classList.remove('playing');
        el.querySelectorAll('[data-orig-fill]').forEach(function(p) {
          var orig = p.getAttribute('data-orig-fill');
          if (orig === '__none__') p.removeAttribute('fill');
          else p.setAttribute('fill', orig);
          p.removeAttribute('data-orig-fill');
        });
      });
      if (index < 0) return;

      var notes = svg.querySelectorAll('.abcjs-note');
      if (index >= notes.length) return;
      var el = notes[index];
      el.classList.add('playing');
      var fillColor = color || 'var(--vscode-editorInfo-foreground, #ff5555)';
      el.querySelectorAll('path, ellipse, circle').forEach(function(p) {
        var current = p.getAttribute('fill');
        p.setAttribute('data-orig-fill', current === null ? '__none__' : current);
        p.setAttribute('fill', fillColor);
      });

      // 再生ヘッド: 音符の左端に細いグレー縦棒
      var bbox = el.getBBox();
      var svgBB = svg.getBBox();
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      line.setAttribute('class', 'playhead');
      line.setAttribute('x', String(bbox.x - 3));
      line.setAttribute('y', String(svgBB.y));
      line.setAttribute('width', '1.2');
      line.setAttribute('height', String(svgBB.height));
      svg.appendChild(line);
    }

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'render') {
        if (msg.abc && msg.abc.trim()) {
          try {
            ABCJS.renderAbc('paper', msg.abc, {
              responsive: 'resize',
              staffwidth: 700,
              add_classes: true,
              paddingtop: 0,
              paddingbottom: 30,
              paddingleft: 0,
              paddingright: 0
            });
            drawVelocityBars(msg.velocities || []);
            info.textContent = '';
          } catch (e) {
            paper.innerHTML = '<div class="empty-msg">Render error</div>';
            info.textContent = String(e);
          }
        } else {
          paper.innerHTML = '<div class="empty-msg">No notes on this line</div>';
          info.textContent = '';
        }
      } else if (msg.type === 'highlight') {
        setPlayhead(msg.index, msg.color);
      }
    });

    paper.innerHTML = '<div class="empty-msg">Move cursor to an MML line</div>';
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
