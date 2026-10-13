# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 目的

Cursor（VS Code フォーク）の UI を CSS でカスタマイズするプロジェクト。GitHub で公開する前提で、利用者がリポジトリを取得して `install.cmd` を実行すれば作者と同じデザインになることを目標とする。

現在の機能：セカンダリサイドバーの右端に、Antigravity 風の縦アイコンバーを作り、Claude Code・Codex・Antigravity・Kimi Code・Cody・Windsurf の拡張機能ビューをそこへ移す。アイコンはドラッグ＆ドロップで上下に並べ替えられる。左端のアクティビティバーも縦にする。

左右の ON/OFF は既存の設定で行い、OFF はその側を Cursor 本来の表示に戻す（ユーザーの要望）。独自の設定キーは使わない。`settings.json` に書くと「不明な設定」として警告され、注入した CSS / JS からは設定値を読めないため。
- 右：`workbench.secondarySideBar.showLabels`。見た目（縦帯）は即時に切り替わるが、レイアウトと拡張機能の配置は Cursor の起動中に変えられない（「View: Reset View Locations」は利用者自身の配置まで消し、新しいコンテナを作るコマンドはない）。そこで `package.json` の `"main"` を `out/cursor-custom-main.js` に差し替え、Cursor のメインプロセスの起動直後（`main.js` より前）に `scripts/state.cjs` の `syncAtStartup()` を走らせて、この設定どおりに `state.vscdb` を整える。これで右の切り替えも再起動だけで反映される。Electron には、アプリの準備完了前に済ませる処理（userData の設定やプロトコル登録）があるため、同期処理（`node:sqlite`）だけで行い、静的 import で `main.js` より先に評価させている。例外は握りつぶし、Cursor の起動を止めない。`false` でタブに `.icon` が付き、`src/secondary-activitybar.css` の全セレクタ（`:has(> .title .composite-bar-action-tab.icon)` で限定）と JS が有効になる。`true` で Cursor 標準の横タブに戻る。即時に反映される。
- 左：Cursor 独自の `workbench.activityBar.orientation`（`vertical` / `horizontal`）。再起動後に反映される。

譲れない要件は「AI は右、ファイルは左」。設定 `"workbench.activityBar.orientation": "vertical"` だけでも左端に縦のアイコンバーは作れるが、その場合は拡張機能の画面が左のサイドバーに開くうえ、Claude Code のチャットと Codex はエクスプローラーの中に残る。そのため、この案は採用していない。同じ理由で、拡張機能化よりインストーラー方式を優先している。拡張機能の API からは、ビューを新しいコンテナへ移すこともレイアウトを切り替えることもできず、起動中に `state.vscdb` を書き換えるのは確実でないため。

## コマンド

Cursor を閉じた状態で、Cursor の外のターミナルから実行する（Cursor 内のターミナルから実行すると、起動中チェックで止まる）。

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1              # 適用
powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall   # 解除
# テスト用：別のインストール・ユーザーデータ・拡張フォルダに対して実行
powershell -ExecutionPolicy Bypass -File install.ps1 -CursorPath <dir> -UserDataDir <dir> -ExtensionsDir <dir>
```

ビルド・lint・テストはない。

## 構成と処理の流れ

- `install.ps1`：Cursor のインストール先をレジストリ（Uninstall キーの `InstallLocation`）から探し、起動中なら中止する。`ELECTRON_RUN_AS_NODE=1` で `Cursor.exe` を Node として使い、`scripts/cursor-custom.js` を実行する。`install.cmd` / `uninstall.cmd` はこれを呼ぶだけ。
- `scripts/state.cjs`：右側の配置（AI 拡張の場所とレイアウト）を設定どおりに整える処理。`MOVED_VIEWS` もここにある。インストーラーと Cursor の起動時（`out/cursor-custom-state.cjs` としてコピー）の両方から使う。
- `scripts/cursor-custom.js`：適用・解除の本体。利用者に Node や Python を求めないため、Cursor 同梱の Node（`node:sqlite` が使える）で動かす。適用時の処理は次のとおり（起動フックの設置も含む）。
  1. `src/*.css` を連結し、インストール済み拡張の SVG アイコンを data URI のマスクにした CSS を末尾に生成して、`workbench.html` と同じフォルダに `cursor-custom.css` として置く。アイコンの判別名（コンテナ名・ビュー名）も拡張の `package.json` から読む。`src/*.js` は連結して `cursor-custom.js` として置く。
  2. `workbench.html` の `</head>` 直前に `<!-- cursor-custom:start -->…<!-- cursor-custom:end -->` で囲んだ `<link>` と `<script>` を入れる。
  3. `product.json` の `checksums` を更新する（SHA-256 の Base64、末尾の `=` なし）。
  4. `settings.json` に `SETTINGS` の既定値（上記 2 つ）を `// cursor-custom` 付きで追加し（すでにあるキーには触らない）、`state.vscdb` の `views.customizations` と `cursor/unifiedAppLayout` を書き換える。

  解除は印（マーカーと `// cursor-custom`）を頼りに取り除き、レイアウトは `globalStorage/cursor-custom.backup.json` に退避した値に戻す。どちらの処理も何度実行しても結果が同じになるように保つこと。
- `src/secondary-activitybar.css`：縦アイコンバーの CSS。寸法は Antigravity の activitybar（幅 42px、項目 42×42、アイコン 18px、選択中は内側 6px・角丸 4px の背景）に合わせている。
- `src/secondary-activitybar.js`：右端の縦帯の制御。(1) 縦帯の場所を空ける：Cursor は画面全体の幅を `window.innerWidth` から取るので（`.monaco-workbench` や `body` を CSS で狭めても追従しない）、縦帯 ON の間は `innerWidth` を 42px 少なく返すように上書きし、`resize` を発火して配置し直させる。縦帯は `position: fixed` でウィンドウ右端に置く。縦帯は、Agent レイアウト（`body[data-sidebar-position="right"]`。セカンダリサイドバーが左に来る）では左端に置く：`<html>.cursor-custom-strip-left` を付け、`.monaco-workbench` を `margin-left` で縦帯の幅だけずらす（Cursor のメニュー位置はずれないことを確認済み）。縦帯は最上部から始め、タイトルバーの高さぶんをタイトルバーの色で塗って、狭めた分の隙間を埋める。(2) ON/OFF の検知：0.5 秒ごとにタブの `.icon` を見て `<html>.cursor-custom-strip` を付け外しし、状態を localStorage に記録する（記録がなければ ON）。(3) セカンダリサイドバーを閉じたまま起動するとタブ列が作られないので、タイトルバーの `a.titlebar-agents-icon`（Toggle Agents）を押して一度開閉させる。ボタンは再描画されるので押すたびに探し直す。閉じたサイドバーは `display: none` と `visibility: hidden` になるため、CSS で縦帯だけ表示を戻している。(4) Agent のチャットの項目（`codicon-files`、チャットごとに 1 つ増える）は縦帯から CSS で隠し、代わりに縦帯に Agent のボタン（`.csb-agent-button`。最後に使ったチャットを開き、チャットが 1 つもなければ、隠れた「New Agent」ボタン `[data-command-id="auxiliaryBar.newAgentMenu"]` を押して新しく作る。閉じたサイドバーでも DOM にあり、押すとサイドバーが開く）と、タイトルに横並びのタブ（`.csb-agent-tabs`）を作る。タブのクリック・× ・中クリック・右クリックは、隠した元の項目に渡す。右クリックは元の項目の位置にメニューが出るので、渡す瞬間だけ元の項目を透明のままタブの位置に置く（祖先の `.composite-bar-scrollable` に `transform` があり `position: fixed` の基準がずれるので、置いてから実測で補正する）。本物の右クリックの処理中に渡すとメニューがすぐ閉じるため `setTimeout` で渡し、メニューが閉じるまで元の項目を戻さない。(5) 縦帯の一番下の「Customize」ボタン：スクリプトからコマンドを直接実行できないので、インストーラーが `keybindings.json` に `ctrl+shift+alt+f12` → `workbench.action.openCustomizeEditor` を登録し、ボタンはそのキー操作を合成して送る（`keyCode` は `Object.defineProperty` で付ける。Cursor は合成したキー操作も受け付ける）。DOM の組み立てでは `innerHTML` を使わない（CSP の Trusted Types で拒否される）。(6) 縦帯の下部のアカウント（`.csb-account-button`）：ページからは Cursor の保存データを読めないので、`state.cjs` の `writeAccount()` が起動時（とインストール時）に `cursorAuth/cachedScopedProfile` の表示名・画像 URL と `cursorAuth/stripeMembershipType` だけを `workbench.html` の隣の `cursor-custom-account.json` に書き出し（トークンやメールアドレスは書かない。未ログインならファイルを消す）、スクリプトが `fetch` で読む。押すとタイトルバーの歯車（`workbench.action.openAgentLayoutQuickMenu`、Open Cursor Settings）を押す。(7) ドラッグ＆ドロップの並べ替えを上下方向で効かせる。Cursor のタブ列は、ドロップ先の前後を項目上の X 座標で判定する（`updateFromDragging` の `horizontallyBefore`）。そこで縦帯上の `dragover` / `drop` を document のキャプチャ段階で止め、Y 座標を X 座標に置き換えた `DragEvent` を同じ要素に送り直す。

## Cursor の内部仕様（v3.24.12 で確認。CSS やスクリプトを変えるときの前提）

- **Agent レイアウトと縦帯。** 「Open Chat as Editor Tabs」が有効なままだと、Agent レイアウトのセカンダリサイドバーは Agent 専用表示になり、タブ列（`.composite-bar-container`）が DOM に存在しない。右 ON の間は `state.cjs` がこれを無効にするので、Agent レイアウトでもタブ列があり、縦帯は左端に出る。レイアウト（`cursor/unifiedAppLayout`）を `editor` にするのは、右を ON にした最初の 1 回だけ（`APPLIED_ONCE`）で、その後は利用者が選んだレイアウトを再起動後も保つ（Cursor は実行中に切り替えたレイアウトを別の場所にも保存しており、正常終了すれば次回もそのレイアウトで開く）。テストで CDP の `Browser.close` で閉じると終了時の保存が走らないので、レイアウトの持ち越しを確かめるときは `Ctrl+Q` で終了すること。
- **拡張がセカンダリサイドバーにあると、Agent のエディタタブ表示が自動で無効になる。** 「Open Chat as Editor Tabs」（保存キー `cursor/chatEditorGroupEnabled`）は、セカンダリサイドバーに拡張のビューコンテナがあると自動で無効になり、標準の composite bar が出る。この CSS はその標準のタブ列を前提にしている。対象の拡張が 1 つも入っていないと Agent 専用表示（`.using-embedded-editor-part`）のままで縦帯が出ないので、右 ON の間は `state.cjs` がこのキーを `false` にする（元の値は `cursor-custom.backup.json` に退避し、OFF で戻す）。
- **Cursor は拡張の `viewsContainers.secondarySidebar` を受け付けない。** そのビューはエクスプローラーに入る（Claude Code・Codex が該当）。そのため、ビューを生成コンテナ `workbench.views.service.auxiliarybar.cursor-custom.<name>` に入れて、場所を `2`（セカンダリサイドバー）にする。activitybar 用コンテナを持つ拡張（Antigravity・Kimi Code・Cody・Windsurf）は、`workbench.view.extension.<id>` をコンテナごと移す。対象の一覧は `MOVED_VIEWS`。
- **タブのアイコンの差し替え。** タブは `li.composite-bar-action-tab > .composite-bar-action-tab-label > a.action-label` の構造になっている。拡張は `a.action-label` の `aria-label`（コンテナ名またはビュー名）で判別する。`li` の `aria-label` は状態によって空になるため使えない。Agent タブは `codicon-files` なので、codicon の `robot`（U+EC20）に差し替えている。
- **標準の挿入線はセカンダリサイドバーでは表示されない。** Cursor 標準の挿入線の CSS は `.composite-bar-container > .composite-bar` を前提にしている。セカンダリサイドバーでは間に `.composite-bar-scrollable` が挟まるため、一度も表示されない。そのため、`.dragged-over` と `.left` / `.right` を条件にして自前で描いている。
- **Editor レイアウトで Agent 一覧（unified sidebar）を開くと、閉じられなくなる。** セカンダリサイドバー上部の「Show Agents Side Bar」（`.auxiliary-bar-title-sidebar-toggle`）を押すと、Agent 一覧は空のまま開く。さらにタイトルが Agent 専用表示に変わって縦帯とこのボタンが消え、閉じるにはコマンド `Toggle Agents Side Bar`（`workbench.action.toggleUnifiedSidebar`）が必要になる。そのため、縦帯の表示中はこのボタンを CSS で隠している。
- **対応できない拡張。** GitHub Copilot Chat は VS Code 本体の組み込みチャット（`workbench.panel.chat`）の中で動くが、Cursor にはこの組み込みチャットがないため対象外。Windsurf（`codeium.codeium`）は Cursor のマーケットプレイスになく、Open VSX の VSIX から入れる。
- **`workbench.html` の CSP。** `style-src 'self' 'unsafe-inline'`、`img-src` は `data:` を許可、`script-src 'self'`。同じフォルダの CSS と data URI のマスク画像は使える。外部 URL のスタイルシートは使えない。
- **アップデートで本体が上書きされる。** Cursor をアップデートすると `resources/app` 配下が置き換わるため、利用者は再度インストールする必要がある。

## 動作確認の方法

実際の Cursor を書き換えずに確認する。

- **テスト用インストール**：インストール先のコピーを作る。書き換える `workbench/` フォルダと `product.json` だけ実体をコピーし、それ以外のフォルダはジャンクションにする。
- **起動**：`--user-data-dir`・`--extensions-dir`・`--remote-debugging-port` を付けて起動する。Claude Code の中から起動するときは、環境変数 `ELECTRON_RUN_AS_NODE` を外すこと。外さないと Cursor.exe が Node として動き、オプションを受け付けない。
- **確認**：CDP（`Runtime.evaluate` と `Page.captureScreenshot`）で DOM とスクリーンショットを確認する。CSS の調整は、`<style>` を差し込んで、その場で見ながら行える。
- **状態を変える**：レイアウトやビューの配置は、`state.vscdb` を直接書き換える方が確実。キーボード操作でコマンドを打つ方法は不安定だった。
