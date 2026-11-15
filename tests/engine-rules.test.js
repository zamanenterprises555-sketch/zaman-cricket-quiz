const E=require('../engine.js');
const fs=require('fs');global.eval(fs.readFileSync(require('path').join(__dirname,'../questions.js'),'utf8').replace('const questionSets','global.questionSets'));
const qs=questionSets; let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}};
// bands
[[0,6],[2,6],[2.01,4],[4,4],[5,3],[6,3],[7.9,2],[8,2],[9,1],[10,1],[10.01,-1]].forEach(([t,r])=>ok(E.runsFor(t,10)===r,`band ${t}`));
[[12,6],[24,4],[30,3],[45,2],[60,1],[60.5,-1]].forEach(([t,r])=>ok(E.runsFor(t,60)===r,`band60 ${t}`));
ok(E.limitFor('ONE WORD QUSTIONS 1')===60,'typo');ok(E.limitFor('PICTURE IDENTIFYING 2')===300,'pic');
console.log(JSON.stringify(E.listSets(qs).map(x=>[x.type.key,x.sets.map(s=>s.name+':'+s.ok)])));
let room=E.newRoom({code:'T',pid:'h',name:'H',now:1,solo:true});
const R=a=>{const r=E.reduce(room,Object.assign({by:'solo',now:Date.now()},a),qs); if(r.error) throw new Error(a.type+': '+r.error); room=r.room; return room;};
['a1','a2','a3'].forEach((p,i)=>{R({type:'join',pid:p,name:p,now:i+2});R({type:'team',pid:p,team:'A'})});
['b1','b2'].forEach((p,i)=>{R({type:'join',pid:p,name:p,now:i+9});R({type:'team',pid:p,team:'B'})});
R({type:'start'});
let g=()=>room.g, inn=()=>E.cur(room.g);
ok(g().phase==='openers','openers');
R({type:'setBatters',striker:'a1',non:'a2'});R({type:'setBowler',pid:'b1'});ok(g().phase==='select','select');
const ballMcq=(right,t,bowlerRight=true)=>{const i=inn();const qi=E.box(i).find(x=>!i.used['q'+x]);R({type:'pick',qi});const q=qs[room.g.set][qi];
 R({type:'bowlerAns',choice:bowlerRight?q.a:(q.a+1)%4}); if(!bowlerRight) return; R({type:'batAns',choice:right?q.a:(q.a+1)%4,time:t,seq:room.g.seq});};
ballMcq(true,1);ok(inn().runs===6&&inn().striker==='a1','six');
ballMcq(true,9);ok(inn().runs===7&&inn().striker==='a2','one rotates');
ballMcq(true,5);ok(inn().runs===10&&inn().striker==='a1','three rotates');
console.log("pre-extra",JSON.stringify({r:inn().runs,s:inn().striker,n:inn().non,b:inn().balls}));ballMcq(true,3,false);console.log("post",JSON.stringify({r:inn().runs,e:inn().extras,s:inn().striker,n:inn().non,b:inn().balls}));ok(inn().runs===11&&inn().extras===1&&inn().striker==='a1'&&inn().balls===4,'extra');
ballMcq(false,1);ok(inn().wkts===1&&g().phase==='nextBatsman'||inn().striker==='a3','wicket');
console.log('after wicket',g().phase,inn().striker,inn().non);
ballMcq(true,7);// 2 runs ball 6 -> over end
console.log('over end',g().phase,inn().striker,inn().non,inn().prevBowler);
ok(g().phase==='nextBowler'&&inn().striker==='a2','over end swap + next bowler');
let r=E.reduce(room,{type:'nextBowler',pid:'b1',by:'b2'},qs);ok(r.error,'same bowler blocked');
R({type:'nextBowler',pid:'b2'});ok(g().phase==='select','select2');
// timeout
const i=inn();const qi=E.box(i).find(x=>!i.used['q'+x]);R({type:'pick',qi});R({type:'bowlerAns',choice:qs[room.g.set][qi].a});R({type:'timeout',seq:room.g.seq});
ok(inn().wkts===2,'timeout wicket'); console.log('after 2nd wicket', g().phase, inn().striker, inn().non);
ballMcq(false,1); console.log('innings now',g().innings,g().target,g().phase);
ok(g().innings===2&&g().target===14,'innings switch');
R({type:'setBatters',striker:'b1',non:'b2'});R({type:'setBowler',pid:'a1'});
while(room.status==='playing'){ if(g().phase==='nextBowler'){const c=g().order[inn().bowl].find(p=>p!==inn().prevBowler);R({type:'nextBowler',pid:c});continue;} ballMcq(true,1); }
console.log(JSON.stringify(g().result), inn().runs, inn().balls);
ok(g().result.winner==='B'&&g().result.by==='wkts','chase win');
console.log(fails?'FAILS '+fails:'ALL OK');
