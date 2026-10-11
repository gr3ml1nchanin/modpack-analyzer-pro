'use strict';
const electron = require('electron');
const contextBridge = electron.contextBridge;
const ipcRenderer = electron.ipcRenderer;

contextBridge.exposeInMainWorld('api', {
  win: { minimize: () => ipcRenderer.invoke('win:minimize'),
         maximize: () => ipcRenderer.invoke('win:maximize'),
         close:    () => ipcRenderer.invoke('win:close'),
         state:    () => ipcRenderer.invoke('win:state') },
  dlg: { folder: () => ipcRenderer.invoke('dlg:folder'),
         file:   (opts) => ipcRenderer.invoke('dlg:file', opts) },
  sh:  { open: (p) => ipcRenderer.invoke('sh:open', p),
         reveal: (p) => ipcRenderer.invoke('sh:reveal', p) },

  mp: { scan: (root) => ipcRenderer.invoke('mp:scan', root),
        modinfo: (root, mods) => ipcRenderer.invoke('mp:modinfo', root, mods) },

  log: { analyze: (p) => ipcRenderer.invoke('log:analyze', p) },

  file: { read: (p) => ipcRenderer.invoke('file:read', p),
          openText: (p) => ipcRenderer.invoke('file:open-text', p),
          openGzText: (p) => ipcRenderer.invoke('file:open-gz-text', p) },

  cfg: { load: (p) => ipcRenderer.invoke('cfg:load', p),
         saveRaw: (p, t) => ipcRenderer.invoke('cfg:saveRaw', p, t),
         update: (p, ch) => ipcRenderer.invoke('cfg:update', p, ch) },

  mods: { classify: (root) => ipcRenderer.invoke('mods:classify', root) },
  junk: { detect: (root) => ipcRenderer.invoke('junk:detect', root) },
  modpack: { analyze: (scan) => ipcRenderer.invoke('modpack:analyze', scan) },
      loot: {
    scan:           (root, vanillaJarPath) => ipcRenderer.invoke('loot:scan', root, vanillaJarPath),
    save:           (root, override) => ipcRenderer.invoke('loot:save', root, override),
    listOverrides:  (root) => ipcRenderer.invoke('loot:list-overrides', root),
    checkLootJS:    (root) => ipcRenderer.invoke('loot:check-lootjs', root),
    pickVanillaJar: () => ipcRenderer.invoke('loot:pick-vanilla-jar'),
    listVanillaJars: (root) => ipcRenderer.invoke('loot:list-vanilla-jars', root)
  },
  recipes: {
    scan:           (root) => ipcRenderer.invoke('recipes:scan', root),
    save:           (root, recipe) => ipcRenderer.invoke('recipes:save', root, recipe),
    delete:         (root, id) => ipcRenderer.invoke('recipes:delete', root, id),
    listOverrides:  (root) => ipcRenderer.invoke('recipes:list-overrides', root),
    checkKubeJS:    (root) => ipcRenderer.invoke('recipes:check-kubejs', root)
  },

  on: {
    logEntry: (cb) => subscribe('log:entry', cb),
    progress: (cb) => subscribe('progress',  cb)
  }
});

function subscribe(channel, cb) {
  const h = (_e, d) => { try { cb(d); } catch (e) { console.error(channel, e); } };
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}