const P = process.env.P || 3130, {DatabaseSync}=require('node:sqlite'), db=new DatabaseSync(process.env.DB);
const g=(s,...a)=>db.prepare(s).get(...a)||{}, qa=(s,...a)=>db.prepare(s).all(...a);
const H=(u,p,b)=>fetch(`http://localhost:${P}/api`+p,{method:b?'POST':'GET',headers:{'x-user-id':String(u),'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({s:r.status,j:await r.json().catch(()=>null)}));
let ok=0,n=0;const T=(name,c,info='')=>{n++;if(c)ok++;console.log((c?'PASS ':'FAIL ')+name,info)};
const id=nm=>g("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.name=? AND u.active=1 ORDER BY r.level='store_manager' DESC, u.id",nm).id;
(async()=>{
const rm=id('王建国'), coach=id('周宁'), hj=id('何静'), mc=id('马超'), cf=id('陈峰'), xw=id('许文博');
for(const [nm,u,k] of [['何静',hj,'ext'],['马超',mc,'int'],['陈峰',cf,'multi'],['许文博',xw,'reserve']]){const r=await H(u,'/stage/'+u);T('stage '+nm,r.s===200&&r.j.stage===k,r.s+' '+(r.j&&r.j.label)+' grad '+(r.j&&r.j.grad.items.map(x=>x.l+':'+x.v).join('|')))}
const tb=await H(hj,'/timebudget');T('ext budget 120',tb.j.budget===120,tb.j.budget+' '+tb.j.stage);
// ext cannot task-delegate
const hs=g('SELECT store_id s FROM user_stores WHERE user_id=?',hj).s, ht=g("SELECT src,src_id FROM instances WHERE store_id=? AND orig_assignee_id=? AND date>=date('now','-7 day') LIMIT 1",hs,hj), as=g("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name='店助' AND u.active=1",hs).id;
let r=await H(hj,'/deleg',{scope:'task',store_id:hs,src:ht.src,src_id:ht.src_id,to_id:as,end:new Date(Date.now()+3*864e5).toISOString().slice(0,10)});T('ext task deleg denied',r.s>=400,r.j&&r.j.error);
// set 马超 single by staff denied, by rm ok
r=await H(as,'/stage/'+mc,{stage:'single'});T('staff cannot set stage',r.s===403);
r=await H(rm,'/stage/'+mc,{stage:'single'});T('rm sets single',r.s===200);
const ms=g('SELECT store_id s FROM user_stores WHERE user_id=?',mc).s;
const must=g("SELECT src,src_id,title FROM instances WHERE store_id=? AND orig_assignee_id=? AND (title LIKE '%晨会%' OR title LIKE '%日报%' OR title LIKE '%安全%' OR title LIKE '%客诉%') AND date>=date('now','-7 day') LIMIT 1",ms,mc);
const cands=qa("SELECT u.id,u.reserve,r.name rn FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND u.active=1 AND r.name IN ('店助','前台经理','客房经理')",ms);
const nonr=cands.find(c=>c.reserve!=='sm'), rsv=cands.find(c=>c.reserve==='sm');
const end=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
if(must.src){r=await H(mc,'/deleg',{scope:'task',store_id:ms,src:must.src,src_id:must.src_id,to_id:nonr.id,end});T('single must -> non-reserve denied',r.s>=400,must.title+' '+(r.j&&r.j.error));
 if(rsv){r=await H(mc,'/deleg',{scope:'task',store_id:ms,src:must.src,src_id:must.src_id,to_id:rsv.id,end});T('single must -> in-store reserve ok',r.s===200,r.j&&(r.j.error||''))} else console.log('SKIP no reserve in store',ms)}
else console.log('SKIP no must task');
r=await H(mc,'/deleg',{scope:'appr',store_id:ms,to_id:nonr.id});T('single appr denied',r.s>=400,r.j&&r.j.error);
await H(rm,'/stage/'+mc,{stage:'int'});
// multi appr
const cs=g('SELECT store_id s FROM user_stores WHERE user_id=? ORDER BY store_id',cf).s, ca=g("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name IN ('前台经理','客房经理','店助') AND u.active=1 ORDER BY r.name='前台经理' DESC",cs).id;
const before=g("SELECT COUNT(*) n FROM instances WHERE store_id=? AND assignee_id=?",cs,ca).n;
const done=g("SELECT id FROM instances WHERE store_id=? AND date=date('now') AND status='done' AND check_result IS NULL AND assignee_id!=? LIMIT 1",cs,ca).id;
r=await H(ca,'/instances/'+done+'/check',{result:'good',comment:'ok'});T('neg1 check before appr denied',r.s===403||!done,'inst '+done+' '+r.s);
r=await H(cf,'/deleg',{scope:'appr',store_id:cs,to_id:ca});T('multi appr ok',r.s===200,r.j&&(r.j.error||''));
T('appr moves no tasks',g("SELECT COUNT(*) n FROM instances WHERE store_id=? AND assignee_id=?",cs,ca).n===before);
const mu=await H(ca,'/must?store='+cs);T('neg1 gets spot checks',mu.s===200&&mu.j.some(x=>x.kind==='spot'),mu.s+' kinds '+[...new Set((mu.j||[]).map(x=>x.kind))].join(','));
if(done){r=await H(ca,'/instances/'+done+'/check',{result:'good',comment:'ok'});T('neg1 check after appr ok',r.s===200,r.j&&(r.j.error||''))}
const other=g("SELECT store_id s FROM user_stores WHERE user_id=? AND store_id!=? LIMIT 1",cf,cs).s, od=g("SELECT id FROM instances WHERE store_id=? AND date=date('now') AND status='done' AND check_result IS NULL LIMIT 1",other).id;
if(od){r=await H(ca,'/instances/'+od+'/check',{result:'good'});T('neg1 other store denied',r.s===403)}
const rc=g("SELECT id FROM rectifications WHERE store_id=? AND status='submitted' LIMIT 1",cs).id;
if(rc){r=await H(ca,'/rectifications/'+rc+'/verify',{pass:true});T('neg1 rect verify ok',r.s===200,r.j&&(r.j.error||''))} else console.log('SKIP no submitted rect');
const dl=await H(cf,'/deleg?store='+cs);T('deleg view multi',dl.j.stage&&dl.j.stage.k==='multi'&&Array.isArray(dl.j.appr),JSON.stringify(dl.j.stage));
// reserve off-store
const me=await H(xw,'/me');T('reserve me',me.j.reserve==='sm_off','stores '+JSON.stringify(me.j.stores));
const rv=await H(xw,'/rsv');T('reserve tasks',rv.s===200&&rv.j.mode==='me'&&rv.j.tasks.length>0,rv.j&&rv.j.tasks.length);
const open=rv.j.tasks.find(t=>t.status==='open');r=await H(xw,'/rsv/'+open.id,{op:'done',note:'完成'});T('reserve done',r.s===200);
r=await H(xw,'/rsv',{user_id:xw,kind:'规划',title:'x'});T('reserve cannot assign',r.s===403);
r=await H(coach,'/rsv',{user_id:xw,kind:'规划',title:'测试规划任务'});T('coach assigns',r.s===200,r.j&&(r.j.error||''));
r=await H(rm,'/rsv',{user_id:xw,kind:'轮岗',title:'无门店'});T('rotation needs store',r.s===400);
const rg=await H(rm,'/rsv');T('rm rsv view',rg.s===200&&rg.j.off.length>=2,'off '+(rg.j&&rg.j.off.length)+' ins '+(rg.j&&rg.j.ins.length));
r=await H(xw,'/pay/'+as);T('reserve no pay',r.s===403);
r=await H(xw,'/rsv/'+open.id,{op:'score',score:5});T('reserve cannot score self',r.s===403);
r=await H(rm,'/rsv/'+open.id,{op:'score',score:5});T('rm scores',r.s===200);
const cd=await H(coach,'/cdesk');T('cdesk stage',cd.j.sms.every(m=>m.stage),cd.j.sms.map(m=>m.name+':'+m.stage).join(' '));
console.log('SUMMARY',ok,'/',n);
})().catch(e=>{console.error(e);process.exit(1)});
