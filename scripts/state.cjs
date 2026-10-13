// Right-side layout state: where the AI extension views live and which Cursor layout is used.
//
// Shared by the installer (scripts/cursor-custom.js) and by Cursor's own startup: the
// installer copies this file to <Cursor>/resources/app/out/cursor-custom-state.cjs and
// points package.json "main" at an entry that calls syncAtStartup() before Cursor's
// main.js runs. That is the only moment the state database can be changed safely, so a
// change of "workbench.secondarySideBar.showLabels" takes effect on the next restart.
//
// Everything here is synchronous (node:sqlite): Electron requires some of main.js's work
// (protocol registration, userData path) to happen before the app is ready.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const TAG = 'cursor-custom';

// Extension views moved into the secondary side bar, top to bottom.
// - `viewId`: Cursor rejects the `secondarySidebar` view containers Claude Code and
//   Codex contribute and drops their views into Explorer, so the view is moved into
//   a generated container of its own (`container`).
// - no `viewId`: the extension's own activity bar container is moved as a whole.
// Tab titles and icons are read from each extension's package.json at install time.
const GENERATED_CONTAINER_PREFIX = 'workbench.views.service.auxiliarybar.';
const AUXILIARYBAR_LOCATION = 2;
const MOVED_VIEWS = [
	{ extension: 'anthropic.claude-code', viewId: 'claudeVSCodeSidebarSecondary', container: `${GENERATED_CONTAINER_PREFIX}${TAG}.claude-code`, label: 'Claude Code' },
	{ extension: 'openai.chatgpt', viewId: 'chatgpt.sidebarSecondaryView', container: `${GENERATED_CONTAINER_PREFIX}${TAG}.codex`, label: 'Codex' },
	{ extension: 'google.google-antigravity', container: 'workbench.view.extension.antigravity-sidebar', label: 'Antigravity' },
	{ extension: 'moonshot-ai.kimi-code', container: 'workbench.view.extension.kimi-sidebar', label: 'Kimi Code' },
	{ extension: 'sourcegraph.cody-ai', container: 'workbench.view.extension.cody', label: 'Cody' },
	{ extension: 'codeium.codeium', container: 'workbench.view.extension.codeium', label: 'Windsurf' },
];

// Values the right strip needs. The secondary side bar only has a tab strip (composite bar)
// in the Editor layout, and only while "Open Chat as Editor Tabs" is off. Cursor turns that
// option off by itself while an extension view is in the secondary side bar, but with none of
// MOVED_VIEWS installed it would show the Agent-only view and no strip.
const LAYOUT_KEY = 'cursor/unifiedAppLayout';
const APPLIED_VALUES = {
	[LAYOUT_KEY]: 'editor',
	'cursor/chatEditorGroupEnabled': 'false',
};
// Applied only when the strip is turned on (no backup yet). After that the layout is the
// user's: switching to the Agent layout is kept across restarts, and the strip moves to the
// left edge there (src/secondary-activitybar.js).
const APPLIED_ONCE = new Set([LAYOUT_KEY]);
const VIEWS_KEY = 'views.customizations';
// The user's own values of APPLIED_VALUES from before the strip was turned on; restored when
// it is turned off. null = the key did not exist.
const BACKUP_FILE = `${TAG}.backup.json`;

// The right strip's ON/OFF switch: false = ON (vertical strip), true = OFF (Cursor's own look).
const RIGHT_SETTING = 'workbench.secondarySideBar.showLabels';

function defaultUserDataDir(argv = []) {
	// Same precedence as Cursor: --user-data-dir, portable mode, then the platform default.
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--user-data-dir' && argv[i + 1]) {
			return path.resolve(argv[i + 1]);
		}
		if (argv[i].startsWith('--user-data-dir=')) {
			return path.resolve(argv[i].slice('--user-data-dir='.length));
		}
	}
	if (process.env.VSCODE_PORTABLE) {
		return path.join(process.env.VSCODE_PORTABLE, 'user-data');
	}
	switch (process.platform) {
		case 'win32': return path.join(process.env.APPDATA, 'Cursor');
		case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor');
		default: return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Cursor');
	}
}

function settingsFile(userDataDir) {
	return path.join(userDataDir, 'User', 'settings.json');
}

// Raw value of a top-level setting in settings.json (JSONC, read as text), or undefined.
function readSetting(userDataDir, key) {
	const file = settingsFile(userDataDir);
	if (!fs.existsSync(file)) {
		return undefined;
	}
	const match = new RegExp(`"${key.replace(/\./g, '\\.')}"\\s*:\\s*([^,\\r\\n/]+)`).exec(fs.readFileSync(file, 'utf8'));
	return match?.[1].trim();
}

function rightStripEnabled(userDataDir) {
	return readSetting(userDataDir, RIGHT_SETTING) !== 'true';
}

function requireSqlite() {
	// node:sqlite prints an ExperimentalWarning on first use; keep Cursor's console clean.
	const emitWarning = process.emitWarning;
	process.emitWarning = () => { };
	try {
		return require('node:sqlite');
	} finally {
		process.emitWarning = emitWarning;
	}
}

function openDb(userDataDir) {
	const file = path.join(userDataDir, 'User', 'globalStorage', 'state.vscdb');
	if (!fs.existsSync(file)) {
		return undefined;
	}
	const { DatabaseSync } = requireSqlite();
	const db = new DatabaseSync(file);
	db.exec('PRAGMA busy_timeout = 3000');
	const toText = value => value == null ? undefined : typeof value === 'string' ? value : Buffer.from(value).toString('utf8');
	return {
		dir: path.dirname(file),
		get: key => toText(db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key)?.value),
		set: (key, value) => db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run(key, value),
		delete: key => db.prepare('DELETE FROM ItemTable WHERE key = ?').run(key),
		close: () => db.close(),
	};
}

function readViews(raw) {
	const views = raw ? JSON.parse(raw) : {};
	views.viewContainerLocations ??= {};
	views.viewLocations ??= {};
	views.viewContainerBadgeEnablementStates ??= {};
	return views;
}

// Right strip ON: Editor layout, AI extension views in the secondary side bar.
// Returns a short description of what changed, or '' when everything was already in place.
function applyRight(db) {
	const changes = [];
	const backupFile = path.join(db.dir, BACKUP_FILE);
	const backup = fs.existsSync(backupFile) ? JSON.parse(fs.readFileSync(backupFile, 'utf8')) : {};
	let backupChanged = false;
	for (const [key, value] of Object.entries(APPLIED_VALUES)) {
		const current = db.get(key);
		const firstTime = !(key in backup);
		if (firstTime) {
			backup[key] = current ?? null;
			backupChanged = true;
		}
		if (current !== value && (firstTime || !APPLIED_ONCE.has(key))) {
			db.set(key, value);
			changes.push(`${key} = ${value}`);
		}
	}
	if (backupChanged) {
		fs.writeFileSync(backupFile, JSON.stringify(backup, null, '	'));
	}
	const raw = db.get(VIEWS_KEY);
	const views = readViews(raw);
	for (const view of MOVED_VIEWS) {
		views.viewContainerLocations[view.container] = AUXILIARYBAR_LOCATION;
		if (view.viewId) {
			views.viewLocations[view.viewId] = view.container;
		}
	}
	const next = JSON.stringify(views);
	if (next !== raw) {
		db.set(VIEWS_KEY, next);
		changes.push(`moved ${MOVED_VIEWS.map(v => v.label).join(', ')} to the secondary side bar`);
	}
	return changes.join('; ');
}

// Right strip OFF / uninstall: the layout and view placement from before the strip was turned on.
function restoreRight(db) {
	const changes = [];
	const raw = db.get(VIEWS_KEY);
	const views = readViews(raw);
	for (const view of MOVED_VIEWS) {
		delete views.viewContainerLocations[view.container];
		if (view.viewId && views.viewLocations[view.viewId] === view.container) {
			delete views.viewLocations[view.viewId];
		}
	}
	const next = JSON.stringify(views);
	if (raw !== undefined && next !== raw) {
		db.set(VIEWS_KEY, next);
		changes.push('restored view placement');
	}
	const backupFile = path.join(db.dir, BACKUP_FILE);
	if (fs.existsSync(backupFile)) {
		const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
		for (const [key, value] of Object.entries(backup)) {
			if (value === null) {
				db.delete(key);
			} else {
				db.set(key, value);
			}
			changes.push(`restored ${key} (${value ?? 'default'})`);
		}
		fs.rmSync(backupFile);
	}
	return changes.join('; ');
}

// Brings the state in line with the right strip setting. `force` = 'off' restores
// regardless of the setting (uninstall).
function syncRight(userDataDir, force) {
	const db = openDb(userDataDir);
	if (!db) {
		return '';
	}
	try {
		return force !== 'off' && rightStripEnabled(userDataDir) ? applyRight(db) : restoreRight(db);
	} finally {
		db.close();
	}
}

// Account shown at the bottom of the strip (Cursor shows it in its Agents list, which this
// layout cannot use). The page cannot read Cursor's storage, so the display name, picture URL
// and plan (never tokens or the e-mail address) are written next to workbench.html, where
// src/secondary-activitybar.js fetches them. Signed out: the file is removed.
const ACCOUNT_FILE = `${TAG}-account.json`;

function workbenchDir(outDir) {
	for (const dir of ['electron-sandbox', 'electron-browser']) {
		const candidate = path.join(outDir, 'vs', 'code', dir, 'workbench');
		if (fs.existsSync(path.join(candidate, 'workbench.html'))) {
			return candidate;
		}
	}
	return undefined;
}

function readAccount(userDataDir) {
	const db = openDb(userDataDir);
	if (!db) {
		return undefined;
	}
	try {
		const profile = JSON.parse(db.get('cursorAuth/cachedScopedProfile') || 'null');
		if (!profile || !db.get('cursorAuth/accessToken')) {
			return undefined;
		}
		return {
			displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
			pictureUrl: typeof profile.pictureUrl === 'string' && profile.pictureUrl.startsWith('https://') ? profile.pictureUrl : '',
			plan: db.get('cursorAuth/stripeMembershipType') || '',
		};
	} finally {
		db.close();
	}
}

function writeAccount(userDataDir, outDir) {
	const dir = workbenchDir(outDir);
	if (!dir) {
		return;
	}
	const file = path.join(dir, ACCOUNT_FILE);
	const account = readAccount(userDataDir);
	if (account) {
		fs.writeFileSync(file, JSON.stringify(account));
	} else {
		fs.rmSync(file, { force: true });
	}
}

function removeAccount(outDir) {
	const dir = workbenchDir(outDir);
	if (dir) {
		fs.rmSync(path.join(dir, ACCOUNT_FILE), { force: true });
	}
}

// Called from Cursor's main process before main.js runs (this file is out/cursor-custom-state.cjs
// there). Must never stop Cursor from starting.
function syncAtStartup() {
	const userDataDir = defaultUserDataDir(process.argv);
	try {
		syncRight(userDataDir);
	} catch (err) {
		console.error(`[${TAG}] could not update the layout: ${err && err.message}`);
	}
	try {
		writeAccount(userDataDir, __dirname);
	} catch (err) {
		console.error(`[${TAG}] could not read the account: ${err && err.message}`);
	}
}

module.exports = {
	TAG,
	MOVED_VIEWS,
	RIGHT_SETTING,
	defaultUserDataDir,
	settingsFile,
	readSetting,
	rightStripEnabled,
	syncRight,
	writeAccount,
	removeAccount,
	syncAtStartup,
};
