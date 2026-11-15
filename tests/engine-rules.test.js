// node tests/engine-rules.test.js
const E=require('../engine.js');
const fs=require('fs');global.eval(fs.readFileSync(require('path').join(__dirname,'../questions.js'),'utf8').replace('const questionSets','global.questionSets'));
const qs=questionSets; let fails=0; const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}};
[[0,6],[2,6],[2.01,4],[4,4],[5,3],[6,3],[7.9,2],[8,2],[9,1],[10,1],[10.01,-1]].forEach(([t,r])=>ok(E.runsFor(t,10)===r,`band ${t}`));
[[12,6],[24,4],[30,3],[45,2],[60,1],[60.5,-1]].forEach(([t,r])=>ok(E.runsFor(t,60)===r,`band60 ${t}`));
ok(E.limitFor('ONE WORD QUSTIONS 1')===60,'typo');ok(E.limitFor('PICTURE IDENTIFYING 2')===300,'pic');
let room=E.newRoom({code:'T',pid:'h',name:'H',now:1,solo:true});
const R=a=>{const r=E.reduce(room,Object.assign({by:'solo',now:Date.now()},a),qs); if(r.error) throw new Error(a.type+': '+r.error); room=r.room; return room;};
const X=(a,by='solo')=>E.reduce(room,Object.assign({by,now:5},a),qs).error;
['a1','a2','a3','a4'].forEach((p,i)=>{R({type:'join',pid:p,name:p,now:i+2});R({type:'team',pid:p,team:'A'})});
['b1','b2'].forEach((p,i)=>{R({type:'join',pid:p,name:p,now:i+9});R({type:'team',pid:p,team:'B'})});
ok(X({type:'start'}),'start blocked before toss');
R({type:'toss',coin:0.9}); ok(room.toss.winner==='B'&&room.toss.face==='T','toss: tails -> team B');
ok(X({type:'tossChoice',choice:'bat'},'a1'),'toss loser cannot choose');
R({type:'tossChoice',choice:'bowl'}); ok(room.firstBat==='A','B chose bowl -> A bats');
R({type:'start'});
let g=()=>room.g, inn=()=>E.cur(room.g);
R({type:'setBatters',striker:'a1',non:'a2'});R({type:'setBowler',pid:'b1'});ok(g().phase==='select','select');
const pickFirst=()=>{const i=inn();const qi=E.box(i).find(x=>!i.used['q'+x]);R({type:'pick',qi});return qi;};
const ballMcq=(right,t)=>{const qi=pickFirst();const q=qs[room.g.set][qi];R({type:'bowlerAns',choice:q.a});R({type:'batAns',choice:right?q.a:(q.a+1)%4,time:t,seq:room.g.seq});};
ballMcq(true,1);ok(inn().runs===6&&inn().striker==='a1','six');
ballMcq(true,9);ok(inn().runs===7&&inn().striker==='a2','one rotates');
// bowler wrong twice, then right
const qi=pickFirst(), q=qs[room.g.set][qi];
R({type:'bowlerAns',choice:(q.a+1)%4}); ok(inn().runs===8&&inn().extras===1&&inn().balls===2&&g().phase==='bowlerAnswer'&&g().q===qi,'wrong bowler: +1 extra, ball not counted, same question');
ok(X({type:'pick',qi:E.box(inn()).find(x=>x!==qi&&!inn().used['q'+x])}),'cannot pick another question');
R({type:'bowlerAns',choice:(q.a+2)%4}); ok(inn().runs===9&&inn().extras===2&&inn().balls===2&&g().tries===2,'second wrong: +1 more, still not counted');
ok(JSON.stringify(g().wrongTried)===JSON.stringify([(q.a+1)%4,(q.a+2)%4]),'wrong choices remembered');
ok(inn().bw.b1.r===9&&inn().striker==='a2','extras conceded by bowler, no strike change');
R({type:'bowlerAns',choice:q.a}); ok(g().phase==='bat','correct -> goes to batsman');
R({type:'batAns',choice:q.a,time:1,seq:g().seq}); ok(inn().runs===15&&inn().balls===3&&g().tries===0,'ball counted only after bowler correct');
const m=inn().miss.find(x=>x.kind==='extra'); ok(m&&m.n===2&&m.q===qi,'review list has bowler wrong x2');
ballMcq(true,5);ballMcq(true,7);ballMcq(false,1);
ok(inn().balls===6&&inn().wkts===1,'6 legal balls despite extras');
ok(inn().miss.some(x=>x.kind==='bowled'),'review list has wrong batsman answer');
console.log('after over',g().phase,g().pending);
// replace offline (non-solo check)
room.players.b1.online=false;room.players.a2.online=true;
while(g().phase!=='select'){ if(g().phase==='nextBatsman') R({type:'nextBatsman',pid:E.candidates(g(),inn())[0]}); else if(g().phase==='nextBowler') R({type:'nextBowler',pid:'b2'}); }
room.players.b2.online=false; room.teams.B.captain='b1';
ok(X({type:'replace',slot:'bowler',pid:'b1'},'a1'),'other team cannot replace bowler');
room.host='zz';
let rr=E.reduce(room,{type:'replace',slot:'bowler',pid:'b1',by:'b1',now:1},qs); ok(!rr.error&&E.cur(rr.room.g).bowler==='b1','captain replaces offline bowler');
room.players.b2.online=true;
rr=E.reduce(room,{type:'replace',slot:'bowler',pid:'b1',by:'b1',now:1},qs); ok(rr.error,'cannot replace online bowler');
room.host='h';
// super over: force tie
room=JSON.parse(JSON.stringify(room));
console.log(fails?'FAILS '+fails:'ALL OK (part 1)');
