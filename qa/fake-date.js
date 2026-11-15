const off = Number(process.env.LT_OFF_DAYS || 0) * 864e5, R = Date;
class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
global.Date = F;
