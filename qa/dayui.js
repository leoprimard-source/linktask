// 上下班打卡界面走查（390px）。用法: PORT=3131 SHOTS=dir node qa/dayui.js
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const P = process.env.PORT || 3131, U = 'http://localhost:' + P, O = process.env.SHOTS || __dirname;
(async () => {
  const users = await (await fetch(U + '/api/users')).json(), by = f => users.find(f);
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const open = async (uid, route) => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push('PE:' + e.message)); p.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errs.push(r.status() + ':' + r.url().replace(/.*\/api/, '')); });
    await p.goto(U + '/'); await p.evaluate(u => { localStorage.lt_uid = u; }, String(uid)); await p.goto(U + '/#/' + route); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200); return { p, errs, ctx }; };
  const sm = by(u => u.name === '陈峰');
  let { p, errs, ctx } = await open(sm.id, 'home');
  await p.click('[data-punch="in"]'); await p.waitForTimeout(500); await p.screenshot({ path: O + '/d1_sign.png' });
  await p.click('.sheet [data-i="0"]'); await p.waitForTimeout(1500);
  await p.screenshot({ path: O + '/d2_start.png' }); console.log('start modal:', await p.locator('.modal h1').innerText().catch(() => 'NONE'));
  await p.click('.modal [data-close].btn'); await p.waitForTimeout(400);
  await p.click('[data-punch="out"]'); await p.waitForTimeout(1500); await p.screenshot({ path: O + '/d3_sum.png' });
  await p.evaluate(() => document.querySelector('.modal .list .task')?.scrollIntoView()); await p.waitForTimeout(300); await p.screenshot({ path: O + '/d4_sum_items.png' });
  await p.evaluate(() => document.querySelectorAll('#mf input[name^="r"]').forEach(i => { i.value = '今天客诉多，明早处理'; }));
  await p.evaluate(() => { const s = document.querySelector('#mf select[name="d1"]'); if (s) { s.value = 'coach'; s.dispatchEvent(new Event('change')); } });
  await p.fill('#mf [name="note"]', '午间退房高峰顺利'); await p.click('#mf button.primary'); await p.waitForTimeout(1500);
  console.log('after submit:', await p.locator('#myshift').innerText().catch(() => 'NONE'), errs.join(' ') || 'no-err'); await ctx.close();
  const coach = by(u => u.level === 'coach');
  ({ p, errs, ctx } = await open(coach.id, 'dayrep')); await p.screenshot({ path: O + '/d5_rep.png' });
  const l = p.locator('[data-daylog]').first(); if (await l.count()) { await l.click(); await p.waitForTimeout(1000); await p.screenshot({ path: O + '/d6_log.png' }); }
  console.log('coach', errs.join(' ') || 'no-err'); await ctx.close();
  const fd = users.filter(u => /^前台(高级|中级|初级)$/.test(u.role_name));
  for (const f of fd) { ({ p, errs, ctx } = await open(f.id, 'home')); if (await p.locator('[data-punch="in"]').count()) {
    await p.click('[data-punch="in"]'); await p.waitForTimeout(1500); await p.screenshot({ path: O + '/d7_fd_start.png' }); console.log('fd', f.name, errs.join(' ') || 'no-err'); await ctx.close(); break; } await ctx.close(); }
  await b.close();
})();
