export interface WebviewAsset {
  readonly scriptUri: string;
  readonly styleUri: string;
}

export function createWebviewHtml(cspSource: string, nonce: string, assets: WebviewAsset): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${cspSource}; img-src ${cspSource} data:; script-src 'nonce-${nonce}'; style-src ${cspSource};" />
    <link rel="stylesheet" href="${assets.styleUri}" />
    <title>Arc</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${assets.scriptUri}"></script>
  </body>
</html>`;
}
