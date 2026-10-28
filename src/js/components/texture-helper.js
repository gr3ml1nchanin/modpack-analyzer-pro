window.TextureHelper = {
  cache: new Map(),
  
  async load(root, itemIds) {
    if (!window.API || !window.API.textures) return; // Защита, если IPC не готов
    const uniqueIds = [...new Set(itemIds)].filter(id => id && !this.cache.has(id));
    if (uniqueIds.length === 0) return;
    
    try {
      const res = await window.API.textures.batch(root, uniqueIds);
      for (const [id, p] of Object.entries(res)) {
        if (p) {
          const url = 'katan-icon://' + encodeURIComponent(p).replace(/%5C/g, '/');
          this.cache.set(id, url);
        } else {
          this.cache.set(id, null); 
        }
      }
    } catch (e) {
      console.error('Texture load error:', e);
    }
  },
  
  get(id) {
    if (!this.cache) return null;
    return this.cache.get(id);
  },
  
  html(id, size = 16) {
    const url = this.get(id);
    if (!url) return '';
    return `<img src="${url}" style="width:${size}px; height:${size}px; object-fit:contain; image-rendering:pixelated; vertical-align:middle; margin-right:6px;" />`;
  }
};