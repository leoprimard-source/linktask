const { chromium } = require(process.env.PW_CORE || 'playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const pages = [[5, '#/care?store=3'], [5, '#/complaints?store=3'], [5, '#/repair'], [34, '#/repair'], [34, '#/mycare'], [5, '#/home'], [5, '#/notices'], [34, '#/notices'], [1, '#/care?store=3'], [1, '#/complaints']];
  for (const [uid, h] of pages) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { errs.push('DIALOG'); d.dismiss(); });
    await p.goto('http://localhost:3103/'); await p.evaluate(u => localStorage.lt_uid = u, String(uid));
    await p.goto('http://localhost:3103/' + h); await p.waitForTimeout(1800);
    const x = await p.evaluate(() => window.__xss || 0), raw = await p.evaluate(() => document.body.innerText.includes('<img src=x'));
    console.log(uid, h, 'xss=' + x, 'escapedTextShown=' + raw, errs.join('|'));
    await ctx.close();
  }
  await b.close();
})();
