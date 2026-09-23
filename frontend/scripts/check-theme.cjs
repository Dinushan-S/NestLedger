const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

// Run the real style factories with native rendering stubbed out.
const cache = new Map();
let activeTheme;
function load(file) {
  file = path.resolve(__dirname, '..', file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const requireMock = (id) => {
    if (id === 'react-native') return { StyleSheet: { create: (styles) => styles } };
    if (id.includes('theme-context')) return {
      useTheme: () => ({ theme: activeTheme }),
      useThemedStyles: (factory) => factory(activeTheme),
    };
    if (id.includes('constants/nestledger')) return load('constants/nestledger.ts');
    throw new Error(`Unexpected import: ${id}`);
  };
  vm.runInNewContext(code, { require: requireMock, module, exports: module.exports });
  return module.exports;
}

const palettes = load('constants/nestledger.ts');
const shared = load('components/nestledger/nestledger.styles.ts');
for (const palette of [palettes.darkTheme, palettes.theme, palettes.darkTheme]) {
  activeTheme = palette;
  const styles = shared.useStyles ? shared.useStyles() : shared.styles;
  assert.equal(styles.screen.backgroundColor, palette.background, 'Screen must follow the selected theme');
  assert.equal(styles.input.color, palette.text, 'Input text must follow the selected theme');
  assert.equal(styles.cardTitle.color, palette.text, 'Card text must follow the selected theme');
  assert.equal(styles.bodyMuted.color, palette.textMuted, 'Secondary text must follow the selected theme');
  assert.equal(styles.currencyChipActive.backgroundColor, palette.primarySoft, 'Selected options must follow the theme');
}
console.log('Theme switching styles passed (dark → light → dark).');

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255)
      .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const palette of [palettes.theme, palettes.darkTheme]) {
  for (const [foreground, background] of [['onPrimary', 'primary'], ['onDanger', 'danger'], ['onSecondary', 'secondary']]) {
    assert.ok(contrast(palette[foreground], palette[background]) >= 4.5, `${foreground}/${background} must have readable contrast`);
  }
}
for (const background of ['background', 'surface', 'surfaceMuted', 'primarySoft', 'secondarySoft', 'dangerSoft']) {
  for (const foreground of ['text', 'textMuted']) {
    assert.ok(contrast(palettes.darkTheme[foreground], palettes.darkTheme[background]) >= 4.5, `${foreground}/${background} must be readable in dark mode`);
  }
}

// Guard every app component against reintroducing a fixed light-palette import.
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', 'app', 'components'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
for (const file of files.filter(file => /\.tsx?$/.test(file))) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier.text.endsWith('constants/nestledger')) continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      assert.ok(!bindings.elements.some(binding => (binding.propertyName ?? binding.name).text === 'theme'), `${file} imports the fixed light palette`);
    }
  }
}
console.log('Text contrast and app-wide theme import checks passed.');
