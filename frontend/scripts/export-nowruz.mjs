import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const source = await readFile(new URL('src/superset_jalali/nowruz.py', root), 'utf8');
const table = Object.fromEntries([...source.matchAll(/(\d{4}): "(\d{4}-\d{2}-\d{2})"/g)].map(m => [Number(m[1]), m[2]]));
if (Object.keys(table).length !== 202 || !table[1350] || !table[1551]) throw new Error('Incomplete Nowruz table');
await writeFile(new URL('frontend/src/nowruz.ts', root), '// Generated from nowruz.py; do not edit.\nexport const NOWRUZ: Record<number, string> = '+JSON.stringify(table, null, 2)+';\n');
// Independent Python results, generated for unit tests, never shipped in the wheel.
const { execFileSync } = await import('node:child_process');
const code = `import json,sys,types
from pathlib import Path
from datetime import date,timedelta
package=types.ModuleType('superset_jalali')
package.__path__=[str(Path.cwd().parent/'src/superset_jalali')]
sys.modules['superset_jalali']=package
from superset_jalali.calendar import g2j
from superset_jalali.nowruz import NOWRUZ
days=set()
day=date.fromisoformat(NOWRUZ[1390])
end=date.fromisoformat(NOWRUZ[1421])
while day<end:
 days.add(day); day+=timedelta(days=1)
for s in NOWRUZ.values():
 for offset in range(-2,3):
  d=date.fromisoformat(s)+timedelta(days=offset)
  if date.fromisoformat(NOWRUZ[1350])<=d<date.fromisoformat(NOWRUZ[1551]): days.add(d)
print(json.dumps([[d.isoformat(),list(g2j(d))] for d in sorted(days)]))`;
await writeFile(new URL('frontend/test/fixtures.json', root), execFileSync(process.env.PYTHON || 'python3', ['-c', code]));
