const P = process.env.P || 3130, {DatabaseSync}=require('node:sqlite'), db=new DatabaseSync(process.env.DB,{readOnly:true});
const g=(s,...a)=>db.prepare(s).get(...a)||{}, qa=(s,...a)=>db.prepare(s).all(...a);
const H=(u,p,b)=>fetch(`http://localhost:${P}/api`+p,{method:b?'POST':'GET',headers:{'x-user-id':String(u),'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({s:r.status,j:await r.json().catch(()=>null)}));
let ok=0,n=0;const T=(name,c,info='')=>{n++;if(c)ok++;console.log((c?'PASS ':'FAIL ')+name,info)};
(async()=>{
const sid=1, by=rn=>g("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name=? AND u.active=1 ORDER BY u.id",sid,rn).id;
const sm=g('SELECT user_id id FROM user_stores WHERE store_id=?',sid).id, fm=by('前台经理'), fd=by('前台初级'), sa=by('保安'), as=by('店助');
T('roles seeded', qa("SELECT r.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.store_id=? AND r.name IN ('餐厅服务员','保安') AND u.active=1",sid).length>=3);
const me=await H(fd,'/me');T('me.shift',me.j.shift&&me.j.shift.code,JSON.stringify(me.j.shift));
const lb=await H(sm,'/labor?store='+sid);T('labor sm',lb.s===200&&lb.j.sched.rows.length>10,'rows '+lb.j.sched.rows.length+' issues '+lb.j.sched.issues.length+' bad '+lb.j.sched.issues.filter(i=>i.lv==='bad').length);
console.log('  issues:',lb.j.sched.issues.slice(0,6).map(i=>i.text).join(' | '));
console.log('  rows:',lb.j.sched.rows.map(r=>r.role_name+':'+r.cells.join('')).join(' '));
const lf=await H(fm,'/labor?store='+sid);T('labor 前台经理',lf.s===200&&lf.j.cost_rate==null,'editable '+lf.j.sched.rows.filter(r=>r.edit).map(r=>r.role_name).join(','));
const lst=await H(fd,'/labor?store='+sid);T('labor plain staff denied',lst.s===403);
const day=lb.j.sched.days[6];
let r=await H(fm,'/labor/shift',{uid:sa,date:day,shift:'休'});T('前台经理 cannot schedule 保安',r.s===403);
r=await H(fm,'/labor/shift',{uid:fd,date:day,shift:'C'});T('invalid shift for role',r.s===400);
r=await H(fm,'/labor/shift',{uid:fd,date:day,shift:'O'});T('前台经理 schedules 前台',r.s===200);
r=await H(as,'/labor/shift',{uid:sa,date:day,shift:'C'});T('店助 schedules 保安',r.s===200);
r=await H(fm,'/labor/publish',{store_id:sid,from:lb.j.sched.days[0]});T('前台经理 cannot publish',r.s===403);
r=await H(sm,'/labor/publish',{store_id:sid,from:lb.j.sched.days[0]});console.log('  publish by sm',r.s,r.j&&(r.j.error||'ok'));
const od=await H(sm,'/onduty?store='+sid);T('onduty',od.s===200,JSON.stringify(od.j).slice(0,220));
const pu=await H(fd,'/punch',{kind:'in'});console.log('  punch',pu.s,pu.j&&(pu.j.msg||pu.j.error));
// task-shift alignment today
const t=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
const sm2=qa("SELECT user_id, date, shift FROM schedules"),inst=qa("SELECT i.assignee_id, i.due_time, i.title, r.name rn FROM instances i JOIN users u ON u.id=i.assignee_id JOIN roles r ON r.id=u.role_id WHERE i.store_id=? AND i.date=(SELECT MAX(date) FROM instances WHERE store_id=? AND date<=date('now','+8 hours')) AND i.src='tpl' AND r.level='staff'",sid,sid);
const map=Object.fromEntries(lb.j.sched.rows.map(r=>[r.id,r]));const di=lb.j.sched.days.indexOf(t);
if(di>=0){let bad=0,tot=0,ex=[];for(const x of inst){const row=map[x.assignee_id];if(!row)continue;tot++;const c=row.cells[di];if(c==='休'){bad++;ex.push(x.rn+' '+x.due_time+' '+x.title.slice(0,8)+' on 休')}}
 T('no tasks on rest staff today',bad<=tot*0.05,`bad ${bad}/${tot} `+ex.slice(0,4).join('; '));
 const ys=qa("SELECT i.due_time, i.assignee_id FROM instances i JOIN templates tp ON tp.id=i.src_id AND i.src='tpl' JOIN roles r ON r.id=tp.role_id WHERE i.store_id=? AND i.date=? AND r.name='保安'",sid,t);T('保安 tasks on C',ys.every(x=>['C'].includes(map[x.assignee_id]?.cells[di])||x.due_time<'08:00'),ys.map(x=>x.due_time+':'+map[x.assignee_id]?.cells[di]).join(' '));
 const na=qa("SELECT i.assignee_id FROM instances i WHERE i.store_id=? AND i.date=? AND i.title LIKE '%夜审%'",sid,t);T('夜审 on B',na.every(x=>map[x.assignee_id]?.cells[di]==='B'),na.map(x=>map[x.assignee_id]?.cells[di]).join(','));
} else console.log('SKIP today not in week',t);
console.log('SUMMARY',ok,'/',n);
})().catch(e=>{console.error(e);process.exit(1)});
