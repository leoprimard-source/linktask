const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync((process.env.DB || '/home/ubuntu/lt-prov/linktask.db'),{readOnly:true});
const g=s=>db.prepare(s).get()||{};const U=Number(process.argv[2]||419);
const H=(u,p)=>fetch('http://localhost:3120/api'+p,{headers:{'x-user-id':String(u)}}).then(r=>r.status);
(async()=>{const st=r=>g("SELECT u.id FROM users u JOIN stores s ON s.id=u.store_id WHERE s.region_id="+r+" AND u.active=1 ORDER BY u.id LIMIT 1").id;
const sm=r=>g('SELECT us.user_id id FROM user_stores us JOIN stores s ON s.id=us.store_id WHERE s.region_id='+r).id;
const idOf=(t,r)=>g('SELECT x.id FROM '+t+' x JOIN stores s ON s.id=x.store_id WHERE s.region_id='+r+' LIMIT 1').id;
const R=r=>{const sid=g('SELECT id FROM stores WHERE region_id='+r).id;return {sid, uid:st(r), smu:sm(r), pat:idOf('patrols',r), rep:idOf('repairs',r), ins:g('SELECT id FROM instances WHERE store_id='+sid+' LIMIT 1').id}};
const routes=x=>['/career/'+x.uid,'/diag/'+x.smu,'/exec/'+x.uid,'/franchise/'+x.sid,'/handoff/'+x.smu,'/hr/person/'+x.uid,'/instances/'+x.ins,'/mentor-cands/'+x.uid,'/mentor-stats/'+x.uid,'/onboard/'+x.smu,'/patrols/'+x.pat,'/pay/'+x.uid,'/person/'+x.uid,'/repairs/'+x.rep,'/store/'+x.sid+'/biz','/store/'+x.sid+'/exec','/store/'+x.sid+'/people','/store/'+x.sid+'/profile','/stores/'+x.sid+'/assign'];
const me=g(`SELECT region_id FROM users WHERE id=${U}`).region_id, other=me===3?4:3, own=routes(R(me)), oth=routes(R(other));let leaks=0;
for(let i=0;i<own.length;i++){const a=await H(U,own[i]),b=await H(U,oth[i]);if(b===200)leaks++;console.log(own[i].split('/').slice(1,3).join('/'),'own',a,'other',b,b===200?'<<LEAK':'')}
console.log('uid',U,'leaks',leaks)})();
