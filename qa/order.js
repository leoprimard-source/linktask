const { chromium } = require(process.env.PW_CORE || 'playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  for (const [uid, route, name] of [[1226, 'home', 'sm_ops'], [1226, 'home?pl=ren', 'sm_ren'], [831, 'home?pl=ren', 'fm_ren'], [831, 'home', 'fm_ops']]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('PE:' + e.message)); p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errs.push(r.status() + ':' + r.url().replace(/.*\/api/, '')); });
    await p.goto('http://localhost:3120/'); await p.evaluate(u => { localStorage.lt_uid = u; }, String(uid));
    await p.goto('http://localhost:3120/#/' + route); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000);
    const o = await p.evaluate(() => [...document.querySelectorAll('#main .sec-t2, #main #ondu, #main #tbud')].map(e => e.id ? '#' + e.id : e.innerText.split('\n')[0].slice(0, 10)).slice(0, 9).join(' > '));
    console.log(name, errs.join(' ') || 'no-err', '|', o);
    if (name === 'sm_ops') { await p.evaluate(() => document.querySelector('#scops')?.scrollIntoView()); await p.screenshot({ path: '' + (process.env.SHOTS || __dirname) + '/f_k_smops.png' }); }
    if (name === 'sm_ren') await p.screenshot({ path: '' + (process.env.SHOTS || __dirname) + '/f_k_smren.png' });
    await ctx.close();
  }
  await b.close();
})();
