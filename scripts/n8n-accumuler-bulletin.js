const staticData = $getWorkflowStaticData('global');
if (!Array.isArray(staticData.bulletins)) staticData.bulletins = [];

function inferFromSummary(summary) {
  for (const line of String(summary || '').split('\n')) {
    let t = line.trim().replace(/^#+\s*/, '').replace(/\*+/g, '').trim();
    if (!t.startsWith('1.')) continue;
    const rest = t.slice(2).trim();
    const dashIdx = rest.search(/[\u2013-]/);
    const name = (dashIdx >= 0 ? rest.slice(0, dashIdx) : rest).trim();
    const cleaned = name.replace(/^scpi\s+/i, '').trim();
    if (cleaned.length >= 4) return cleaned;
  }
  return null;
}

function guessNomProduit(fileName, scpiName) {
  const base = String(fileName || scpiName || '').replace(/\.pdf$/i, '').trim();
  const parts = base.split(/[\s_\-\u2013\u2014]+/).filter(Boolean);
  const skip = new Set(['bti', 'bulletin', 'trimestre', 'trim', 'scpi', 't1', 't2', 't3', 't4', '1er', '2e', '3e', '4e']);
  const kept = parts.filter((p) => {
    const lower = p.toLowerCase();
    if (skip.has(lower)) return false;
    if (/^t[1-4]$/i.test(p)) return false;
    if (/^20[0-9]{2}$/.test(p)) return false;
    return true;
  });
  return kept.length ? kept.join(' ') : base;
}

function namesOverlap(a, b) {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl || al.includes(bl) || bl.includes(al)) return true;
  const ta = al.split(/\s+/).filter((t) => t.length >= 4);
  return ta.length > 0 && ta.every((t) => bl.includes(t));
}

function pickNomProduit(summary, fileName, scpiName) {
  const fromSummary = inferFromSummary(summary);
  const fromFile = guessNomProduit(fileName, scpiName);
  if (fromSummary && fromFile) {
    if (namesOverlap(fromSummary, fromFile)) {
      return fromSummary.length >= fromFile.length ? fromSummary : fromFile;
    }
    return fromFile;
  }
  return fromSummary || fromFile;
}

function guessPeriode(fileName, summary) {
  const text = `${fileName} ${String(summary || '').slice(0, 800)}`;
  const m1 = text.match(/T\s*([1-4])\s*20([0-9]{2})/i);
  if (m1) return `T${m1[1]} 20${m1[2]}`;
  const m2 = text.match(/([1-4])(?:er|e|ème)?\s*trimestre\s*20([0-9]{2})/i);
  if (m2) return `T${m2[1]} 20${m2[2]}`;
  const year = text.match(/20([0-9]{2})/);
  return year ? `T1 20${year[1]}` : 'Trimestre';
}

const j = $input.first().json;
const summary = j.summaryEmail || j.summaryMarkdown || '';
const nom_produit = pickNomProduit(summary, j.fileName, j.scpiName);
staticData.bulletins.push({
  nom_produit,
  summary_markdown: summary,
  fichier_source: j.fileName,
});
if (!staticData.periode) {
  staticData.periode = guessPeriode(j.fileName, summary);
}
return [{ json: j }];
