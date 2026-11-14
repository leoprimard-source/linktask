const TZ = 'Asia/Shanghai';
const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHM = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
function today() { return fmtDate.format(new Date()); }
function nowHM() { return fmtHM.format(new Date()).replace('24:', '00:'); }
function nowStr() { return today() + ' ' + nowHM(); }
function addDays(d, n) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
function weekday(d) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
function dom(d) { return Number(d.slice(8, 10)); }
function addMinutes(hm, m) {
  const [h, mi] = hm.split(':').map(Number);
  const t = Math.min(h * 60 + mi + m, 23 * 60 + 59);
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
module.exports = { today, nowHM, nowStr, addDays, weekday, dom, addMinutes };
