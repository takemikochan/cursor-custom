// 右端の縦アイコンバー（secondary-activitybar.css）を動かすための処理。
(() => {
	const WIDTH = 42; // secondary-activitybar.css の --csb-width と合わせる
	const ROOT_CLASS = 'cursor-custom-strip';
	const AUX = '.part.auxiliarybar';
	const STRIP = `${AUX} > .title > .composite-bar-container`;
	const ITEM = '.composite-bar-action-tab';
	const root = document.documentElement;

	// ---------------------------------------------------------------------------
	// 縦帯の場所を空ける。
	// Cursor は window.innerWidth を画面全体の幅として配置するので（CSS で狭めても追従しない）、
	// 縦帯が ON の間だけ、その分を差し引いた値を返す。このスクリプトは workbench.js より先に読み込まれる。

	// 前回の ON/OFF を覚えておき、最初の配置から縦帯の場所を空ける（起動直後の配置し直しを避ける）。
	// 記録がなければ ON とみなす（インストーラーは ON で設定する）。
	const STORE_KEY = 'cursor-custom.strip';
	let active = (() => {
		try {
			return localStorage.getItem(STORE_KEY) !== '0';
		} catch {
			return true;
		}
	})();
	root.classList.toggle(ROOT_CLASS, active);

	const innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
		?? Object.getOwnPropertyDescriptor(Window.prototype, 'innerWidth');
	if (innerWidth?.get) {
		Object.defineProperty(window, 'innerWidth', {
			configurable: true,
			enumerable: innerWidth.enumerable,
			get() {
				const width = innerWidth.get.call(window);
				return active ? width - WIDTH : width;
			},
			set: innerWidth.set,
		});
	}

	const setActive = on => {
		if (on === active) {
			return;
		}
		active = on;
		root.classList.toggle(ROOT_CLASS, on);
		try {
			localStorage.setItem(STORE_KEY, on ? '1' : '0');
		} catch {
			// 覚えられなくても、次回の起動直後に配置し直すだけ
		}
		window.dispatchEvent(new Event('resize'));
	};

	const tabsOf = aux => aux.querySelectorAll(`:scope > .title ${ITEM}`);

	// セカンダリサイドバーを閉じたまま起動すると、タブ列はまだ作られていない（開いたときに作られる）。
	// タイトルバーの「Toggle Agents」ボタンで一度開いて閉じ、縦帯を作らせる。起動ごとに一度だけ行う。
	let primed = false;
	let auxSeenAt;
	const prime = aux => {
		primed = true;
		// タイトルバーのボタンは描画し直されるので、押すたびに探し直す
		const toggle = () => document.getElementById('workbench.parts.titlebar')?.querySelector('a.titlebar-agents-icon');
		if (!toggle()) {
			return;
		}
		const isOpen = () => !document.querySelector('.monaco-workbench.noauxiliarybar');
		toggle().click();
		const started = Date.now();
		const wait = setInterval(() => {
			if (!tabsOf(aux).length && Date.now() - started < 3000) {
				return;
			}
			clearInterval(wait);
			// 開いた直後の 2 回目のクリックは効かないことがあるので、閉じるまで間をあけて押し直す
			let tries = 0;
			const close = setInterval(() => {
				if (!isOpen() || tries++ >= 5) {
					clearInterval(close);
					return;
				}
				toggle()?.click();
			}, 700);
		}, 50);
	};

	// Agent 一覧（Cursor の unified sidebar）が中身のないまま開いていたら閉じる。
	// このツールの配置では Agent 一覧は空のまま開き、閉じるボタンも消えてしまう（CSS 側でも開くボタンを隠している）。
	// 開いた直後は描画が間に合っていないこともあるので、2 回続けて空だったときだけ閉じる。
	let emptyAgentsTicks = 0;
	const closeEmptyAgentsSidebar = () => {
		const unified = document.getElementById('workbench.parts.unifiedsidebar');
		const open = document.body.classList.contains('unifiedsidebarvisible');
		if (!open || !unified || unified.querySelector(':scope > .content > *')) {
			emptyAgentsTicks = 0;
			return;
		}
		if (++emptyAgentsTicks < 2) {
			return;
		}
		emptyAgentsTicks = 0;
		// 隠れていても押せる。押すと Agent 一覧の表示が切り替わる
		document.querySelector(`${AUX} .auxiliary-bar-title-sidebar-toggle a.action-label`)?.click();
	};

	// 設定 "workbench.secondarySideBar.showLabels" が false だとタブが .icon 表示になる。
	// これを ON の印として <html> にクラスを付け、Cursor に配置し直させる。
	// 縦帯はセカンダリサイドバー側の端に置く。セカンダリサイドバーは常にプライマリサイドバーの反対側で、
	// Editor レイアウトでは右、Agent レイアウト（プライマリサイドバーが右）では左になる。
	const LEFT_CLASS = 'cursor-custom-strip-left';
	const syncSide = () => {
		const left = document.body.dataset.sidebarPosition === 'right';
		if (left !== root.classList.contains(LEFT_CLASS)) {
			root.classList.toggle(LEFT_CLASS, left);
			window.dispatchEvent(new Event('resize'));
		}
	};

	const sync = () => {
		syncSide();
		closeEmptyAgentsSidebar();
		const titlebar = document.getElementById('workbench.parts.titlebar');
		if (titlebar) {
			root.style.setProperty('--csb-top', `${titlebar.getBoundingClientRect().bottom}px`);
		}
		const aux = document.getElementById('workbench.parts.auxiliarybar');
		if (!aux) {
			return;
		}
		// Cursor 本来の表示（右を OFF にして再起動した後）では、セカンダリサイドバーは Agent 専用の
		// 埋め込み表示になり、タブ列はない
		if (aux.classList.contains('using-embedded-editor-part')) {
			setActive(false);
			return;
		}
		const tabs = tabsOf(aux);
		if (!tabs.length) {
			// 起動直後は表示方式が決まる前なので、少し待ってから判断する
			auxSeenAt ??= Date.now();
			if (!primed && Date.now() - auxSeenAt > 1500) {
				prime(aux);
			}
			return;
		}
		setActive([...tabs].some(tab => tab.classList.contains('icon')));
	};
	setInterval(sync, 500);

	// ---------------------------------------------------------------------------
	// Agent のチャットを、右側のサイドバー上部に横並びのタブとして出す。
	//
	// この配置では Cursor の「Open Chat as Editor Tabs」が使えず（拡張機能がセカンダリサイドバーに
	// あると Cursor が強制的に無効にする）、チャットは 1 つずつタブ列の項目になる。そのままだと
	// 縦帯に同じロボットのアイコンが増えていくので、縦帯からは隠し（CSS）、代わりに
	// - 縦帯には Agent のアイコンを 1 つだけ置く（押すと最後に使ったチャットを開く）
	// - 上部に、題名付きのタブを並べる
	// クリック・閉じる・右クリックは、隠した元の項目に渡すので、Cursor 本来の処理で動く。

	const AGENT_BUTTON = 'csb-agent-button';
	const AGENT_TABS = 'csb-agent-tabs';
	const isAgentItem = item => !!item.querySelector(':scope > .composite-bar-action-tab-label > .action-label.codicon-files');
	let lastAgent; // 最後に選択されていたチャットの項目

	const agentItems = strip => [...strip.querySelectorAll(ITEM)].filter(isAgentItem);
	const titleOf = item => item.querySelector('.action-label')?.getAttribute('aria-label') || 'Agent';

	const openItem = item => item.querySelector('.action-label')?.click();

	const itemIds = new WeakMap();
	let nextItemId = 0;
	const itemId = item => {
		if (!itemIds.has(item)) {
			itemIds.set(item, ++nextItemId);
		}
		return itemIds.get(item);
	};

	const ensureAgentButton = strip => {
		let button = strip.querySelector(`:scope > .${AGENT_BUTTON}`);
		if (!button) {
			button = document.createElement('div');
			button.className = AGENT_BUTTON;
			button.setAttribute('role', 'button');
			button.setAttribute('aria-label', 'Agent');
			button.title = 'Agent';
			// workbench.html の CSP（Trusted Types）で innerHTML は使えないので要素を組み立てる
			const hit = document.createElement('span');
			hit.className = 'csb-agent-button-hit';
			const icon = document.createElement('span');
			icon.className = 'codicon codicon-robot';
			hit.append(icon);
			button.append(hit);
			button.addEventListener('click', () => {
				const items = agentItems(strip);
				const target = items.find(item => item.classList.contains('checked'))
					?? (lastAgent?.isConnected ? lastAgent : items[0]);
				if (target) {
					openItem(target);
					return;
				}
				// チャットが 1 つもなければ新しく作る。セカンダリサイドバー上部の「New Agent」ボタンは
				// 閉じていても DOM にあり、押すとサイドバーが開く。なければ Cursor 既定のショートカットを送る。
				const newAgent = document.querySelector(`${AUX} [data-command-id="auxiliaryBar.newAgentMenu"] a.action-label`);
				if (newAgent) {
					newAgent.click();
				} else {
					sendKey({ key: 'L', code: 'KeyL', keyCode: 76, ctrlKey: true, shiftKey: true });
				}
			});
			strip.prepend(button);
		}
		return button;
	};

	// 縦帯の一番下の「Customize」ボタン（Cursor 本来の Agent 一覧にあるもの。この配置では Agent 一覧が使えない）。
	// コマンドを直接実行できないので、インストーラーが keybindings.json に登録した
	// Ctrl+Shift+Alt+F12（workbench.action.openCustomizeEditor）を送る。
	const CUSTOMIZE_BUTTON = 'csb-customize-button';
	const sendKey = ({ key, code, keyCode, ctrlKey = false, shiftKey = false, altKey = false }) => {
		const event = new KeyboardEvent('keydown', { key, code, ctrlKey, shiftKey, altKey, bubbles: true, cancelable: true });
		// Cursor は keyCode でキーを判定するが、KeyboardEvent の初期化では指定できない
		Object.defineProperty(event, 'keyCode', { get: () => keyCode });
		Object.defineProperty(event, 'which', { get: () => keyCode });
		(document.activeElement ?? document.body).dispatchEvent(event);
	};

	const ensureCustomizeButton = strip => {
		if (strip.querySelector(`:scope > .${CUSTOMIZE_BUTTON}`)) {
			return;
		}
		const button = document.createElement('div');
		button.className = CUSTOMIZE_BUTTON;
		button.setAttribute('role', 'button');
		button.setAttribute('aria-label', 'Customize');
		button.title = 'Customize';
		const hit = document.createElement('span');
		hit.className = 'csb-agent-button-hit';
		const icon = document.createElement('span');
		icon.className = 'codicon codicon-extensions';
		hit.append(icon);
		button.append(hit);
		button.addEventListener('click', () => sendKey({ key: 'F12', code: 'F12', keyCode: 123, ctrlKey: true, shiftKey: true, altKey: true }));
		strip.append(button);
	};

	// 縦帯の下部のアカウント（Cursor 本来の Agent 一覧の下に出るもの）。
	// ページからは Cursor の保存データを読めないので、起動時に scripts/state.cjs が
	// 表示名・画像 URL・プランだけを workbench.html の隣に書き出したものを読む。
	// 押すと Cursor Settings を開く（タイトルバーの歯車ボタンを押す）。
	const ACCOUNT_BUTTON = 'csb-account-button';
	let account; // undefined: 読み込み前、null: なし
	fetch('./cursor-custom-account.json', { cache: 'no-store' })
		.then(response => response.ok ? response.json() : null)
		.then(value => { account = value && typeof value === 'object' ? value : null; })
		.catch(() => { account = null; });

	const planLabel = plan => plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Plan` : '';
	const initialsOf = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('') || '?';

	const ensureAccountButton = strip => {
		let button = strip.querySelector(`:scope > .${ACCOUNT_BUTTON}`);
		if (!account) {
			button?.remove();
			return;
		}
		if (button) {
			return;
		}
		button = document.createElement('div');
		button.className = ACCOUNT_BUTTON;
		button.setAttribute('role', 'button');
		const tooltip = [account.displayName, planLabel(account.plan)].filter(Boolean).join('\n');
		button.setAttribute('aria-label', tooltip || 'Account');
		button.title = tooltip;
		const hit = document.createElement('span');
		hit.className = 'csb-agent-button-hit';
		const avatar = document.createElement('span');
		avatar.className = 'csb-account-avatar';
		avatar.textContent = initialsOf(account.displayName || '');
		if (account.pictureUrl) {
			const img = document.createElement('img');
			img.src = account.pictureUrl;
			img.alt = '';
			img.referrerPolicy = 'no-referrer';
			img.addEventListener('load', () => { avatar.textContent = ''; avatar.append(img); });
		}
		hit.append(avatar);
		button.append(hit);
		button.addEventListener('click', () => {
			document.getElementById('workbench.parts.titlebar')
				?.querySelector('[data-command-id="workbench.action.openAgentLayoutQuickMenu"] .action-label')
				?.click();
		});
		strip.append(button);
	};

	const ensureAgentTabs = title => {
		let tabs = title.querySelector(`:scope > .${AGENT_TABS}`);
		if (!tabs) {
			tabs = document.createElement('div');
			tabs.className = AGENT_TABS;
			tabs.setAttribute('role', 'tablist');
			title.prepend(tabs);
		}
		return tabs;
	};

	const renderAgentUi = () => {
		const aux = document.getElementById('workbench.parts.auxiliarybar');
		const title = aux?.querySelector(':scope > .title');
		const strip = title?.querySelector(':scope > .composite-bar-container');
		if (!active || !strip) {
			return;
		}
		const items = agentItems(strip);
		const checked = items.find(item => item.classList.contains('checked'));
		if (checked) {
			lastAgent = checked;
		}
		ensureAgentButton(strip).classList.toggle('checked', !!checked);
		ensureCustomizeButton(strip);
		ensureAccountButton(strip);

		// 上部のタブは、内容が変わったときだけ作り直す。レイアウトの切り替えなどで Cursor が元の項目を
		// 作り直すこともあるので、項目そのものが入れ替わったときも作り直す（古い項目を指したままにしない）
		const tabs = ensureAgentTabs(title);
		const key = items.map(item => `${itemId(item)}\u0000${titleOf(item)}\u0000${item.classList.contains('checked')}`).join('\u0001');
		if (tabs.dataset.key === key) {
			return;
		}
		tabs.dataset.key = key;
		tabs.replaceChildren(...items.map(item => {
			const tab = document.createElement('div');
			tab.className = `csb-agent-tab${item.classList.contains('checked') ? ' checked' : ''}`;
			tab.setAttribute('role', 'tab');
			tab.title = titleOf(item);
			const label = document.createElement('span');
			label.className = 'csb-agent-tab-label';
			label.textContent = titleOf(item);
			const close = document.createElement('span');
			close.className = 'csb-agent-tab-close codicon codicon-close';
			close.title = 'Close';
			close.addEventListener('click', event => {
				event.stopPropagation();
				item.querySelector('.remove-button')?.click();
			});
			tab.addEventListener('click', () => openItem(item));
			tab.addEventListener('auxclick', event => {
				if (event.button === 1) {
					item.querySelector('.remove-button')?.click();
				}
			});
			tab.addEventListener('contextmenu', event => {
				event.preventDefault();
				event.stopPropagation();
				// Cursor はメニューを元の項目の位置に出す。元の項目は隠しているので、
				// その瞬間だけ透明のままタブと同じ位置に置いてから右クリックを渡す
				const rect = tab.getBoundingClientRect();
				const saved = item.getAttribute('style');
				const { clientX, clientY } = event;
				// 本物の右クリックの処理が終わってから渡す（処理中に渡すと、出たメニューがすぐ閉じる）
				setTimeout(() => {
					const place = (left, top) => {
						for (const [name, value] of Object.entries({
							display: 'flex', position: 'fixed', left: `${left}px`, top: `${top}px`,
							width: `${rect.width}px`, height: `${rect.height}px`, opacity: '0', 'pointer-events': 'none',
						})) {
							item.style.setProperty(name, value, 'important');
						}
					};
					// 親要素に transform があると fixed の基準が画面ではなくなるので、置いてから実際の位置で補正する
					place(rect.left, rect.top);
					const placed = item.getBoundingClientRect();
					place(2 * rect.left - placed.left, 2 * rect.top - placed.top);
					item.querySelector('.composite-bar-action-tab-label')?.dispatchEvent(new MouseEvent('contextmenu', {
						bubbles: true, cancelable: true, clientX, clientY, button: 2,
					}));
				}, 0);
				// メニューの表示中に元の項目を隠すとメニューも閉じるので、閉じてから戻す
				const restore = () => saved === null ? item.removeAttribute('style') : item.setAttribute('style', saved);
				const started = Date.now();
				const wait = setInterval(() => {
					const menuOpen = !!document.querySelector('.context-view .monaco-menu');
					if ((!menuOpen && Date.now() - started > 300) || Date.now() - started > 60000) {
						clearInterval(wait);
						restore();
					}
				}, 100);
			});
			tab.append(label, close);
			return tab;
		}));
	};
	setInterval(renderAgentUi, 250);

	// ---------------------------------------------------------------------------
	// ドラッグ＆ドロップの並べ替えを上下方向で効かせる。
	//
	// Cursor のタブ列は横並び前提で、ドロップ先の前後をアイコン上の「左右」の位置で決める
	// （左半分なら前、右半分なら後ろ）。縦に並べ替えた後もそのままなので、縦帯の上の
	// dragover / drop を先に受け取り、縦位置を横位置に置き換えたイベントとして渡し直す。

	const forwarded = new WeakSet();

	const forward = event => {
		if (forwarded.has(event) || !(event.target instanceof Element)) {
			return;
		}
		const item = event.target.closest(ITEM);
		// 横並びのタブ（showLabels: true）のときは縦帯ではないので、そのまま通す
		if (!item || !item.classList.contains('icon') || !item.closest(STRIP)) {
			return;
		}
		const rect = item.getBoundingClientRect();
		const ratio = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
		const copy = new DragEvent(event.type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: rect.left + ratio * rect.width,
			clientY: event.clientY,
			screenX: event.screenX,
			screenY: event.screenY,
			dataTransfer: event.dataTransfer,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
		});
		forwarded.add(copy);
		event.stopImmediatePropagation();
		event.target.dispatchEvent(copy);
		if (copy.defaultPrevented) {
			event.preventDefault();
		}
	};

	for (const type of ['dragover', 'drop']) {
		document.addEventListener(type, forward, true);
	}
})();
