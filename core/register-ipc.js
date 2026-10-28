'use strict';
const worldgenScanner = require('./worldgen-scanner');
const lootEditor = require('./loot-editor');
const lootScanner = require('./loot-scanner');
const path = require('path');
const fsp = require('fs').promises;
const textureExtractor = require('./texture-extractor');
const electron = require('electron');
const reportGen = require('./report-generator');
const liveTracker = require('./live-tracker');
const ipcMain = electron.ipcMain;
const dialog = electron.dialog;
const Logger = require('./logger');
const Modrinth = require('./modrinth');
const classifier = require('./classifier');
const classifyMod = classifier.classifyMod;
const junkDetector = require('./junk-detector');
const detectJunk = junkDetector.detectJunk;
const logAnalyzer = require('./log-analyzer');
const analyzeLog = logAnalyzer.analyzeLog;
const analyzer = require('./analyzer');
const analyzeModpack = analyzer.analyzeModpack;
const scanner = require('./scanner');
const scanModpack = scanner.scanModpack;
const scanModInfo = require('./mod-info');
const recipes = require('./recipes');
const recipeEditor = require('./recipe-editor');
const configEditor = require('./config-editor');

module.exports = function registerIpc(getMainWindow) {
  const modrinth = new Modrinth(path.join(__dirname, '..', 'data', 'cache', 'modrinth'));

    ipcMain.handle('textures:batch', async (_e, root, itemIds) => {
    const modsDir = path.join(root, 'mods');
    const cacheDir = path.join(__dirname, '..', 'data', 'cache', 'textures');
    // Передаем root, чтобы экстрактор нашел minecraft.jar
    return textureExtractor.extractBatch(root, modsDir, cacheDir, itemIds);
  });

  ipcMain.handle('worldgen:scan', async (_e, root) => {
  const modsDir = path.join(root, 'mods');
  return Logger.timed('worldgen', 'scan', () =>
    worldgenScanner.scanWorldgen(modsDir, (i, total, file) => {
      const w = getMainWindow();
      if (w && !w.isDestroyed()) w.webContents.send('progress', { module: 'worldgen', i, total, file });
    })
  );
});
  ipcMain.handle('live:start', (_e, logPath) => {
    return liveTracker.startTracking(logPath, (event) => {
      const w = getMainWindow();
      if (w && !w.isDestroyed()) {
        w.webContents.send('live:event', event);
      }
    });
  });

  ipcMain.handle('live:stop', () => {
    liveTracker.stopTracking();
    return { ok: true };
  });
  
  ipcMain.handle('report:txt', (_e, data) => reportGen.generateTxt(data));
  ipcMain.handle('report:html', (_e, data) => reportGen.generateHtml(data));
  ipcMain.handle('report:prompt', (_e, opts, data) => reportGen.generatePrompt(opts, data));
  ipcMain.handle('report:save', async (_e, content, defaultName) => {
    const { dialog } = require('electron');
    const r = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Сохранить отчёт',
      defaultPath: defaultName,
      filters: [
        { name: 'Text', extensions: ['txt'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (r.canceled) return { ok: false };
    try {
      await require('fs').promises.writeFile(r.filePath, content, 'utf8');
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mp:scan', (_e, root) => scanModpack(root));

  ipcMain.handle('mp:modinfo', async (_e, root, mods) => {
    return scanModInfo(root, mods, (stage, i, total, file) => {
      const w = getMainWindow();
      if (w && !w.isDestroyed()) w.webContents.send('progress', { module: stage, i, total, file });
    });
  });

  ipcMain.handle('mods:classify', async (_e, root) => {
    const modsDir = path.join(root, 'mods');
    const files = (await fsp.readdir(modsDir).catch(() => [])).filter(f => /\.jar$/i.test(f));
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const fp = path.join(modsDir, files[i]);
      try {
        const cls = await Logger.timed('classifier', files[i], () => classifyMod(fp, modrinth));
        const rec = { file: files[i] };
        for (const kk in cls) rec[kk] = cls[kk];
        out.push(rec);
      } catch (e) {
        out.push({ file: files[i], type: 'unknown', error: e.message });
      }
      const w = getMainWindow();
      if (w && !w.isDestroyed()) w.webContents.send('progress', { module: 'classify', i, total: files.length, file: files[i] });
    }
    return out;
  });

  ipcMain.handle('junk:detect', (_e, root) => Logger.timed('junk', 'detect', () => detectJunk(root, { config: true })));
  ipcMain.handle('log:analyze', (_e, logPath) => Logger.timed('analyzer', path.basename(logPath), () => analyzeLog(logPath)));
  ipcMain.handle('modpack:analyze', (_e, scan) => analyzeModpack(scan));

  ipcMain.handle('cfg:load',    (_e, p) => configEditor.load(p));
  ipcMain.handle('cfg:saveRaw', (_e, p, text) => configEditor.saveRaw(p, text));
  ipcMain.handle('cfg:update',  (_e, p, changes) => configEditor.updateValues(p, changes));

  ipcMain.handle('file:read', async (_e, p) => {
    try { return { content: await fsp.readFile(p, 'utf8'), error: null }; }
    catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('file:open-text', async (_e, p) => {
    try {
      const content = await fsp.readFile(p, 'utf8');
      const st = await fsp.stat(p);
      return { content, size: st.size, error: null };
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('file:open-gz-text', async (_e, p) => {
    try {
      const zlib = require('zlib');
      const buf = await fsp.readFile(p);
      const content = zlib.gunzipSync(buf).toString('utf8');
      return { content, size: buf.length, error: null };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('dlg:file', async (_e, opts) => {
    const r = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: opts && opts.filters ? opts.filters : [{ name: 'All', extensions: ['*'] }],
      title: opts && opts.title ? opts.title : 'Файл'
    });
    return r.canceled ? null : r.filePaths[0];
  });
          ipcMain.handle('loot:scan', async (_e, root, vanillaJarPath) => {
    const modsDir = path.join(root, 'mods');
    const send = (module, i, total, file) => {
      const w = getMainWindow();
      if (w && !w.isDestroyed()) w.webContents.send('progress', { module, i, total, file });
    };

    const modList = await Logger.timed('loot', 'scan mods', () =>
      lootScanner.scanLoot(modsDir, (i, total, file) => send('loot', i, total, file))
    );

    const vanilla = await Logger.timed('loot', 'scan vanilla', () =>
      lootScanner.scanVanillaLoot(root, (i, total, file) => send('loot-vanilla', i, total, file), vanillaJarPath)
    );

    const byId = new Map();
    for (const r of vanilla.list) byId.set(r.id, r);
    for (const r of modList) byId.set(r.id, r);

    const merged = Array.from(byId.values());
    const vCount = merged.filter(x => x.vanilla).length;
    Logger.info('loot', 'merged: ' + merged.length + ' (vanilla=' + vCount + ', mods=' + (merged.length - vCount) + ')');
    return { list: merged, vanillaVersion: vanilla.version };
  });

    ipcMain.handle('loot:list-vanilla-jars', (_e, root) => lootScanner.listVanillaJars(root));

  ipcMain.handle('loot:pick-vanilla-jar', async () => {
    const r = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      title: 'Выберите minecraft.jar / client.jar',
      filters: [{ name: 'JAR', extensions: ['jar'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    try {
      const st = await require('fs').promises.stat(p);
      return { path: p, name: require('path').basename(p), size: st.size };
    } catch { return null; }
  });
  
  ipcMain.handle('loot:save',            (_e, root, override) => lootEditor.saveLootOverride(root, override));
  ipcMain.handle('loot:list-overrides',  (_e, root) => lootEditor.listLootOverrides(root));
  ipcMain.handle('loot:check-lootjs',    (_e, root) => lootEditor.checkLootJS(root));

    ipcMain.handle('recipes:scan', async (_e, root) => {
    const modsDir = path.join(root, 'mods');
    return Logger.timed('recipes', 'scan', () =>
      recipes.scanRecipes(modsDir, (i, total, file) => {
        const w = getMainWindow();
        if (w && !w.isDestroyed()) w.webContents.send('progress', { module: 'recipes', i, total, file });
      })
    );
  });
    
  ipcMain.handle('recipes:save',   (_e, root, recipe) => recipeEditor.saveRecipe(root, recipe));
  ipcMain.handle('recipes:delete', (_e, root, id) => recipeEditor.deleteRecipe(root, id));
  ipcMain.handle('recipes:list-overrides', (_e, root) => recipeEditor.listOverrides(root));
  ipcMain.handle('recipes:check-kubejs',   (_e, root) => recipeEditor.checkKubeJS(root));

  Logger.subscribe(entry => {
    const w = getMainWindow();
    if (w && !w.isDestroyed()) w.webContents.send('log:entry', entry);
  });

  Logger.info('ipc', 'Registered');
};