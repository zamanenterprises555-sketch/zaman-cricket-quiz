// node tests/engine-super-over.test.js  — tie -> super over
const E=require('../engine.js');
const fs=require('fs');global.eval(fs.readFileSync(require('path').join(__dirname,'../questions.js'),'utf8').replace('const questionSets','global.questionSets'));
const qs=questionSets;let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}};
let room=E.newRoom({code:'T',pid:'A1',name:'A1',now:1,solo:true});
const R=a=>{const r=E.reduce(room,Object.assign({by:'solo',now:1},a),qs);if(r.error)throw new Error(a.type+': '+r.error);room=r.room;};
R({type:'team',pid:'A1',team:'A'});R({type:'join',pid:'B1',name:'B1',now:2});R({type:'team',pid:'B1',team:'B'});
R({type:'toss',coin:0.1});R({type:'tossChoice',choice:'bat'});R({type:'start'});
const g=()=>room.g,inn=()=>E.cur(room.g);
const ball=(right,t)=>{const i=inn();const qi=E.box(i).find(x=>!i.used['q'+x]);R({type:'pick',qi});const q=qs[g().set][qi];R({type:'bowlerAns',choice:q.a});R({type:'batAns',choice:right?q.a:(q.a+1)%4,time:t,seq:g().seq});return qi;};
ball(true,1);ball(false,1); ok(g().innings===2&&g().target===7,'A 6 all out, target 7');
ball(true,3);ball(true,9);ball(true,9);ball(false,1); // 4+1+1 = 6 -> tie
ok(g().innings===3&&inn().so===1&&inn().bat==='B'&&inn().maxBalls===6,'tie -> super over, team batting second bats first');
const used=new Set([0,1,2,3]);
ok(inn().boxQ.every(x=>!used.has(x)),'super over box uses questions not used in match: '+inn().boxQ);
ball(true,1);ball(false,1); ok(g().innings===4&&g().target===7&&inn().bat==='A','super over 2nd innings, target 7');
ok(inn().boxQ.every(x=>!used.has(x))&&inn().boxQ.join()!==g().inn[2].boxQ.join(),'second super over box distinct');
ball(true,1);ball(true,5); ok(room.status==='finished'&&g().result.winner==='A'&&g().result.by==='super','A wins super over');
console.log(fails?'FAILS '+fails:'ALL OK (super over)');
