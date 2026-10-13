// Cursor UI customization installer.
//
// Run with Cursor's bundled Node runtime (ELECTRON_RUN_AS_NODE=1), so no extra
// dependencies are needed (node:sqlite is used for Cursor's state database):
//
//   Cursor.exe scripts/cursor-custom.js <install|uninstall> --app <Cursor>/resources/app
//              [--user-data <dir>] [--extensions <dir>]
//
// Cursor must be closed: the state database is written and the workbench HTML is
// only read at startup. Besides the CSS/JS, it installs a startup hook (package.json
// "main") that re-applies the right strip's layout on every launch, so toggling
// "workbench.secondarySideBar.showLabels" only needs a restart (see scripts/state.cjs).
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const TAG = 'cursor-custom';
const CSS_FILE = `${TAG}.css`;
const JS_FILE = `${TAG}.js`;
const MARK_START = `<!-- ${TAG}:start -->`;
const MARK_END = `<!-- ${TAG}:end -->`;
const REPO_ROOT = path.resolve(__dirname, '..');
const state = require('./state.cjs');
const { MOVED_VIEWS } = state;

// Keybindings the strip's buttons send as synthetic key presses (src/secondary-activitybar.js
// cannot run commands directly). Keep the keys in sync with that file.
const KEYBINDINGS = [
	// The strip's "Customize" button (Cursor's Agents list has it, but that list is not usable here).
	{ key: 'ctrl+shift+alt+f12', command: 'workbench.action.openCustomizeEditor' },
];

// Defaults written to settings.json; each one is also the user's ON/OFF switch.
// Existing values are left alone so the user's choice survives a reinstall.
const SETTINGS = [
	// Right: false = vertical icon strip (src/secondary-activitybar.css), true = Cursor's tabs.
	['workbench.secondarySideBar.showLabels', 'false'],
	// Left: Cursor's own setting; "vertical" = icon column, "horizontal" = icons across the top.
	['workbench.activityBar.orientation', '"vertical"'],
];

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const opts = { command };
	for (let i = 0; i < rest.length; i += 2) {
		const key = rest[i];
		if (!key.startsWith('--') || rest[i + 1] === undefined) {
			throw new Error(`Invalid argument: ${key}`);
		}
		opts[key.slice(2)] = rest[i + 1];
	}
	if (!['install', 'uninstall'].includes(command)) {
		throw new Error('Usage: cursor-custom.js <install|uninstall> --app <Cursor>/resources/app [--user-data <dir>] [--extensions <dir>]');
	}
	if (!opts.app) {
		throw new Error('--app is required');
	}
	opts['user-data'] ??= state.defaultUserDataDir();
	opts.extensions ??= path.join(os.homedir(), '.cursor', 'extensions');
	return opts;
}

function log(message) {
	console.log(`[${TAG}] ${message}`);
}

// ---------------------------------------------------------------------------
// Workbench HTML / CSS

function findWorkbenchHtml(appDir) {
	for (const dir of ['electron-sandbox', 'electron-browser']) {
		const rel = `vs/code/${dir}/workbench/workbench.html`;
		if (fs.existsSync(path.join(appDir, 'out', rel))) {
			return { rel, file: path.join(appDir, 'out', rel) };
		}
	}
	throw new Error(`workbench.html not found under ${appDir}`);
}

function stripPatch(html) {
	const start = html.indexOf(MARK_START);
	if (start === -1) {
		return html;
	}
	const end = html.indexOf(MARK_END, start);
	if (end === -1) {
		throw new Error('workbench.html has a start marker without an end marker; restore it from the .bak file');
	}
	// Remove the line break inserted before the start marker as well.
	const lineStart = html.lastIndexOf('\n', start);
	return html.slice(0, lineStart === -1 ? start : lineStart) + html.slice(end + MARK_END.length);
}

function latestExtensionDir(extensionsDir, extensionId) {
	if (!fs.existsSync(extensionsDir)) {
		return undefined;
	}
	const prefix = `${extensionId.toLowerCase()}-`;
	const dirs = fs.readdirSync(extensionsDir)
		.filter(name => name.toLowerCase().startsWith(prefix) && fs.existsSync(path.join(extensionsDir, name, 'package.json')))
		.map(name => path.join(extensionsDir, name));
	dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	return dirs[0];
}

// Icon and tab titles for a moved view or container, read from the extension's package.json.
// The tab's aria-label is the container title, or the view name for a view moved on its own.
function extensionTab(extensionDir, view) {
	const pkg = JSON.parse(fs.readFileSync(path.join(extensionDir, 'package.json'), 'utf8'));
	const contributes = pkg.contributes || {};
	const views = contributes.views || {};
	const containerId = view.viewId
		? Object.entries(views).find(([, list]) => list.some(v => v.id === view.viewId))?.[0]
		: view.container.replace(/^workbench\.view\.extension\./, '');
	const container = Object.values(contributes.viewsContainers || {}).flat().find(c => c.id === containerId);
	const labels = view.viewId
		? (views[containerId] || []).filter(v => v.id === view.viewId).map(v => v.name)
		: [container?.title];
	const icon = container?.icon && /\.svg$/i.test(container.icon) ? path.join(extensionDir, container.icon) : undefined;
	return {
		icon: icon && fs.existsSync(icon) ? icon : undefined,
		labels: labels.filter(Boolean),
	};
}

function iconCss(opts) {
	const tab = 'html.cursor-custom-strip .monaco-workbench .part.auxiliarybar.pane-composite-part > .title > .composite-bar-container .composite-bar-action-tab';
	const rules = [];
	for (const view of MOVED_VIEWS) {
		const dir = latestExtensionDir(opts.extensions, view.extension);
		if (!dir) {
			log(`${view.extension} is not installed; install it and run install again to get its icon`);
			continue;
		}
		const { icon, labels } = extensionTab(dir, view);
		if (!icon || !labels.length) {
			log(`no SVG icon or title found for ${view.extension}; the default icon is used`);
			continue;
		}
		const uri = `data:image/svg+xml;base64,${fs.readFileSync(icon).toString('base64')}`;
		const selector = suffix => labels.map(label => `${tab} .action-label[aria-label=${JSON.stringify(label)}]${suffix}`).join(',\n');
		rules.push(`${selector('')} {
	background-color: currentColor !important;
	-webkit-mask: url("${uri}") center / contain no-repeat !important;
	mask: url("${uri}") center / contain no-repeat !important;
}
${selector('::before')} {
	content: none !important;
}`);
	}
	return rules.length ? `\n/* Generated from installed extensions by scripts/cursor-custom.js */\n${rules.join('\n')}\n` : '';
}

// Concatenates src/*<ext> in name order.
function bundle(ext) {
	const srcDir = path.join(REPO_ROOT, 'src');
	return fs.readdirSync(srcDir)
		.filter(name => name.endsWith(ext))
		.sort()
		.map(name => `/* ${name} */\n${fs.readFileSync(path.join(srcDir, name), 'utf8')}`)
		.join('\n');
}

function checksum(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64').replace(/=+$/, '');
}

// Keep product.json in sync so Cursor does not report a corrupt installation.
function updateChecksum(appDir, rel, htmlFile) {
	const productFile = path.join(appDir, 'product.json');
	const text = fs.readFileSync(productFile, 'utf8');
	const product = JSON.parse(text);
	if (!product.checksums || !(rel in product.checksums)) {
		return;
	}
	const next = checksum(htmlFile);
	if (product.checksums[rel] === next) {
		return;
	}
	product.checksums[rel] = next;
	const indent = /^\{\r?\n(\s+)/.exec(text)?.[1] ?? '\t';
	fs.writeFileSync(productFile, JSON.stringify(product, null, indent) + (text.endsWith('\n') ? '\n' : ''));
	log('updated checksum in product.json');
}

function installWorkbench(opts) {
	const { rel, file } = findWorkbenchHtml(opts.app);
	const backup = `${file}.${TAG}.bak`;
	const original = fs.readFileSync(file, 'utf8');
	if (!original.includes(MARK_START)) {
		fs.writeFileSync(backup, original);
	}
	const html = stripPatch(original);
	const tags = `${MARK_START}<link rel="stylesheet" href="./${CSS_FILE}"><script src="./${JS_FILE}"></script>${MARK_END}`;
	const headEnd = html.indexOf('</head>');
	if (headEnd === -1) {
		throw new Error('</head> not found in workbench.html');
	}
	fs.writeFileSync(path.join(path.dirname(file), CSS_FILE), bundle('.css') + iconCss(opts));
	fs.writeFileSync(path.join(path.dirname(file), JS_FILE), bundle('.js'));
	fs.writeFileSync(file, `${html.slice(0, headEnd).trimEnd()}\n\t\t${tags}\n\t${html.slice(headEnd)}`);
	updateChecksum(opts.app, rel, file);
	log(`patched ${file}`);
}

function uninstallWorkbench(opts) {
	const { rel, file } = findWorkbenchHtml(opts.app);
	const html = fs.readFileSync(file, 'utf8');
	if (html.includes(MARK_START)) {
		fs.writeFileSync(file, stripPatch(html));
		log(`restored ${file}`);
	}
	fs.rmSync(path.join(path.dirname(file), CSS_FILE), { force: true });
	fs.rmSync(path.join(path.dirname(file), JS_FILE), { force: true });
	fs.rmSync(`${file}.${TAG}.bak`, { force: true });
	updateChecksum(opts.app, rel, file);
}

// ---------------------------------------------------------------------------
// Startup hook: package.json "main" -> out/cursor-custom-main.js, which runs
// state.cjs's syncAtStartup() and then Cursor's own out/main.js.

const ORIGINAL_MAIN = './out/main.js';
const CUSTOM_MAIN = `./out/${TAG}-main.js`;
const STARTUP_FILES = [`${TAG}-main.js`, `${TAG}-startup.js`, `${TAG}-state.cjs`];

function setPackageMain(appDir, from, to) {
	const file = path.join(appDir, 'package.json');
	const text = fs.readFileSync(file, 'utf8');
	const current = JSON.parse(text).main;
	if (current === to) {
		return false;
	}
	if (current !== from) {
		throw new Error(`unexpected "main" in ${file}: ${current}`);
	}
	const next = text.replace(/^(\s*"main"\s*:\s*)"[^"]*"/m, `$1"${to}"`);
	if (JSON.parse(next).main !== to) {
		throw new Error(`could not update "main" in ${file}`);
	}
	fs.writeFileSync(file, next);
	return true;
}

function installStartup(opts) {
	const out = path.join(opts.app, 'out');
	fs.copyFileSync(path.join(__dirname, 'state.cjs'), path.join(out, `${TAG}-state.cjs`));
	// Static imports run in order: the state is fixed before Cursor's main.js starts.
	fs.writeFileSync(path.join(out, `${TAG}-main.js`), `// Generated by ${TAG} (scripts/cursor-custom.js). Removed by uninstall.
import './${TAG}-startup.js';
import './main.js';
`);
	fs.writeFileSync(path.join(out, `${TAG}-startup.js`), `// Generated by ${TAG} (scripts/cursor-custom.js). Removed by uninstall.
// Applies "workbench.secondarySideBar.showLabels" to Cursor's layout before main.js starts.
import { createRequire } from 'node:module';

try {
	createRequire(import.meta.url)('./${TAG}-state.cjs').syncAtStartup();
} catch (err) {
	console.error('[${TAG}]', err);
}
`);
	if (setPackageMain(opts.app, ORIGINAL_MAIN, CUSTOM_MAIN)) {
		log('installed the startup hook (package.json "main")');
	}
}

function uninstallStartup(opts) {
	if (setPackageMain(opts.app, CUSTOM_MAIN, ORIGINAL_MAIN)) {
		log('removed the startup hook (package.json "main")');
	}
	for (const name of STARTUP_FILES) {
		fs.rmSync(path.join(opts.app, 'out', name), { force: true });
	}
}

// ---------------------------------------------------------------------------
// settings.json (JSONC: edited as text so the user's comments survive)

function settingsFile(opts) {
	return state.settingsFile(opts['user-data']);
}

function installSettings(opts) {
	const file = settingsFile(opts);
	let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{\n}\n';
	for (const [key, value] of SETTINGS) {
		const existing = new RegExp(`"${key.replace(/\./g, '\\.')}"\\s*:\\s*([^,\\r\\n/]+)`).exec(text);
		if (existing) {
			if (existing[1].trim() !== value) {
				log(`settings.json: keeping ${key} = ${existing[1].trim()} (set it to ${value} to turn this side on)`);
			}
			continue;
		}
		const brace = text.indexOf('{');
		if (brace === -1) {
			throw new Error(`${file} is not a JSON object`);
		}
		const isEmpty = /^\s*\}/.test(text.slice(brace + 1));
		text = `${text.slice(0, brace + 1)}\n\t"${key}": ${value}${isEmpty ? '' : ','} // ${TAG}${text.slice(brace + 1)}`;
		log(`settings.json: ${key} = ${value}`);
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, text);
}

// keybindings.json (JSONC array): one line per entry, marked like the settings.
function keybindingsFile(opts) {
	return path.join(opts['user-data'], 'User', 'keybindings.json');
}

function installKeybindings(opts) {
	const file = keybindingsFile(opts);
	let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '[\n]\n';
	for (const binding of KEYBINDINGS) {
		if (text.split('\n').some(line => line.includes(`"command": "${binding.command}"`) && line.includes(`// ${TAG}`))) {
			continue;
		}
		const bracket = text.indexOf('[');
		if (bracket === -1) {
			throw new Error(`${file} is not a JSON array`);
		}
		const isEmpty = /^\s*\]/.test(text.slice(bracket + 1).replace(/^\s*\/\/[^\n]*\n/gm, ''));
		text = `${text.slice(0, bracket + 1)}\n\t{ "key": "${binding.key}", "command": "${binding.command}" }${isEmpty ? '' : ','} // ${TAG}${text.slice(bracket + 1)}`;
		log(`keybindings.json: ${binding.key} -> ${binding.command}`);
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, text);
}

function uninstallKeybindings(opts) {
	const file = keybindingsFile(opts);
	if (!fs.existsSync(file)) {
		return;
	}
	const text = fs.readFileSync(file, 'utf8');
	const next = text.replace(new RegExp(`\\r?\\n[^\\r\\n]*// ${TAG}[^\\r\\n]*`, 'g'), '');
	if (next !== text) {
		fs.writeFileSync(file, next);
		log('removed keybindings added by this tool from keybindings.json');
	}
}

function uninstallSettings(opts) {
	const file = settingsFile(opts);
	if (!fs.existsSync(file)) {
		return;
	}
	const text = fs.readFileSync(file, 'utf8');
	const next = text.replace(new RegExp(`\\r?\\n[^\\r\\n]*// ${TAG}[^\\r\\n]*`, 'g'), '');
	if (next !== text) {
		fs.writeFileSync(file, next);
		log('removed settings added by this tool from settings.json');
	}
}

// ---------------------------------------------------------------------------

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.command === 'install') {
		installWorkbench(opts);
		installStartup(opts);
		installSettings(opts);
		installKeybindings(opts);
		state.writeAccount(opts['user-data'], path.join(opts.app, 'out'));
		const changes = state.syncRight(opts['user-data']);
		log(`right strip: ${state.rightStripEnabled(opts['user-data']) ? 'ON' : 'OFF'}${changes ? ` (${changes})` : ''}`);
		log('done. Start Cursor to see the changes.');
	} else {
		uninstallWorkbench(opts);
		uninstallStartup(opts);
		state.removeAccount(path.join(opts.app, 'out'));
		uninstallSettings(opts);
		uninstallKeybindings(opts);
		const changes = state.syncRight(opts['user-data'], 'off');
		if (changes) {
			log(changes);
		}
		log('done.');
	}
}

main().catch(err => {
	console.error(`[${TAG}] ${err.code === 'EPERM' || err.code === 'EACCES' ? `${err.message}\nRun again with write access to the Cursor installation.` : err.message}`);
	process.exit(1);
});
