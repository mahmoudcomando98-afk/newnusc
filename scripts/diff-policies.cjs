const fs = require('fs');
function load(p){
  let s = fs.readFileSync(p, 'utf16le').replace(/^\uFEFF/, '');
  const m = s.match(/(\{[\s\S]*\})/g) || [];
  const rows = [];
  for (const chunk of m) {
    try {
      const obj = JSON.parse(chunk);
      if (obj.policyname) rows.push(obj);
    } catch {}
  }
  return rows;
}
const o = load('storage-policies-old.txt');
const n = load('storage-policies-new.txt');
const newNames = new Set(n.map(r => r.policyname));
for (const r of o) {
  if (!newNames.has(r.policyname)) {
    console.log(`OLD ONLY: ${r.policyname} [${r.cmd}]`);
    console.log(`   qual: ${r.qual}`);
    console.log(`   with_check: ${r.with_check}`);
  }
}
