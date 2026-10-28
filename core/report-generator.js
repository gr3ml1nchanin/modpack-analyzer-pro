'use strict';

function generateTxt(data) {
  const { scan, analysis, junk } = data;
  let out = `=== KatAn Modpack Report ===\n`;
  out += `Generated: ${new Date().toLocaleString()}\n`;
  out += `Path: ${scan.root}\n`;
  out += `Loader: ${scan.loader}\n`;
  out += `MC Version: ${scan.version || 'Unknown'}\n\n`;

  out += `--- SUMMARY ---\n`;
  out += `Mods: ${scan.summary.mods}\n`;
  out += `Configs: ${scan.summary.configs}\n`;
  out += `Logs: ${scan.summary.logs}\n`;
  out += `Crashes: ${scan.summary.crashes}\n`;
  out += `Total Mod Size: ${(scan.summary.totalModSize / 1024 / 1024).toFixed(1)} MB\n\n`;

  if (analysis && analysis.issues.length) {
    out += `--- ISSUES ---\n`;
    for (const iss of analysis.issues) {
      out += `[${iss.severity.toUpperCase()}] ${iss.title}\n`;
      out += `${iss.description}\n`;
      for (const item of iss.items.slice(0, 10)) {
        out += `  - ${item.key}: ${item.detail}\n`;
      }
      out += `\n`;
    }
  } else {
    out += `--- ISSUES ---\nNo critical issues found.\n\n`;
  }

  if (junk) {
    out += `--- JUNK ---\n`;
    out += `Empty configs: ${junk.emptyConfigs.length}\n`;
    out += `Duplicate JARs: ${junk.duplicateJars.length}\n`;
    out += `Wasted space: ${(junk.totalWastedBytes / 1024 / 1024).toFixed(1)} MB\n\n`;
  }

  return out;
}

function generateHtml(data) {
  const { scan, analysis, junk } = data;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>KatAn Report - ${scan.name}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121212; color: #e0e0e0; padding: 40px; max-width: 900px; margin: 0 auto; line-height: 1.6; }
  h1, h2 { color: #fff; border-bottom: 1px solid #333; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .card { background: #1a1a1a; padding: 16px; border-radius: 8px; border: 1px solid #333; }
  .val { font-size: 24px; font-weight: bold; color: #3b82f6; }
  .lbl { font-size: 12px; color: #888; text-transform: uppercase; }
  .issue { background: #1a1a1a; border-left: 4px solid #ef4444; padding: 12px 16px; margin-bottom: 12px; border-radius: 4px; }
  .issue.warning { border-left-color: #f59e0b; }
  .issue.info { border-left-color: #3b82f6; }
  .issue-title { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
  .mono { font-family: monospace; font-size: 12px; color: #aaa; }
</style>
</head>
<body>
  <h1>KatAn Modpack Report</h1>
  <p class="mono">${scan.root}</p>
  
  <div class="grid">
    <div class="card"><div class="val">${scan.summary.mods}</div><div class="lbl">Mods</div></div>
    <div class="card"><div class="val">${scan.summary.configs}</div><div class="lbl">Configs</div></div>
    <div class="card"><div class="val">${scan.summary.crashes}</div><div class="lbl">Crashes</div></div>
    <div class="card"><div class="val">${(scan.summary.totalModSize / 1024 / 1024).toFixed(0)} MB</div><div class="lbl">Size</div></div>
  </div>

  <h2>Analysis Issues</h2>
  ${analysis && analysis.issues.length ? analysis.issues.map(iss => `
    <div class="issue ${iss.severity}">
      <div class="issue-title">${iss.title}</div>
      <div>${iss.description}</div>
      <ul>
        ${iss.items.slice(0, 10).map(i => `<li class="mono">${i.key}: ${i.detail}</li>`).join('')}
      </ul>
    </div>
  `).join('') : '<p>No issues found.</p>'}

</body>
</html>`;
}

function generatePrompt(options, data) {
  // options: { logs: boolean, issues: boolean, loot: boolean, mods: boolean, generation: boolean }
  let out = `System: You are an expert Minecraft modpack developer. Analyze the following data and find the root causes of issues, then suggest fixes. Data collected from modpack "${data.scan.name}".\n\n`;

  if (options.issues && data.analysis) {
    out += `--- DETECTED CONFLICTS & ISSUES ---\n`;
    for (const iss of data.analysis.issues) {
      out += `[${iss.severity}] ${iss.title}\n`;
      for (const i of iss.items.slice(0, 15)) out += `  - ${i.key}: ${i.detail}\n`;
    }
    out += `\n`;
  }

  if (options.mods && data.modInfo) {
    out += `--- MOD LIST (Total: ${data.modInfo.list.length}) ---\n`;
    for (const m of data.modInfo.list) {
      out += `- ${m.name} (${m.id}) v${m.ver}\n`;
    }
    out += `\n`;
  }

  if (options.logs && data.logs && data.logs.length > 0) {
    out += `--- LOG ERRORS (Extracted) ---\n`;
    for (const line of data.logs) {
      out += `${line}\n`;
    }
    out += `\n`;
  }

  return out;
}

module.exports = { generateTxt, generateHtml, generatePrompt };