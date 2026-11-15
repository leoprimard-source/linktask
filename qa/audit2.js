const { chromium } = require(process.env.PW_CORE || 'playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const L = JSON.parse(process.argv[2]);
  for (const [uid, route, name] of L) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('PE:' + e.message)); p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errs.push(r.status() + ':' + r.url().replace(/.*\/api/, '')); });
    await p.goto('http://localhost:3120/'); await p.evaluate(u => { localStorage.lt_uid = u; }, String(uid));
    await p.goto('http://localhost:3120/#/' + route); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
    await p.screenshot({ path: `' + (process.env.SHOTS || __dirname) + '/f_${name}.png` });
    console.log(name, 'ERR:', errs.join(' '), '|', (await p.evaluate(() => document.querySelector('#main').innerText)).replace(/\s+/g, ' ').slice(0, 120));
    await ctx.close();
  }
  await b.close();
})();
