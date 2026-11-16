// node tests/engine-timeout.test.js  (v2.3: no "out" before the batsman has had reading time + full limit)
const E=require('../engine.js');
const fs=require('fs');global.eval(fs.readFileSync(require('path').join(__dirname,'../questions.js'),'utf8').replace('const questionSets','global.questionSets'));
const qs=questionSets; let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
let room=E.newRoom({code:'ABCDEF',pid:'h',name:'H',now:1});
const R=(a,by='h')=>{const r=E.reduce(room,Object.assign({by},a),qs); if(r.error) throw new Error(a.type+': '+r.error); room=r.room; return room;};
const X=(a,by='h')=>E.reduce(room,Object.assign({by},a),qs).error;
R({type:'team',pid:'h',team:'A',now:2});R({type:'join',pid:'b',name:'B',now:3},'b');R({type:'team',pid:'b',team:'B',now:4},'b');
R({type:'toss',coin:0.1,now:5});R({type:'tossChoice',choice:'bat',now:6});
ok(E.READ_S===3,'reading time is 3 seconds');
R({type:'start',sid:'m1',now:7});ok(room.g.sid==='m1','match id stored');
const L=room.g.limit, T0=100000;
const qi=E.box(E.cur(room.g))[0];R({type:'pick',qi,now:T0-5000},'b');R({type:'bowlerAns',choice:qs[room.g.set][qi].a,now:T0},'b');
ok(room.g.phase==='bat'&&room.g.seenAt===0,'bat phase, not yet seen');
ok(X({type:'timeout',seq:room.g.seq,now:T0+(L+2)*1000},'b'),'timeout refused before reading+limit (from delivery)');
ok(X({type:'seen',seq:room.g.seq,now:T0+8000},'b'),'only striker can mark seen');
R({type:'seen',seq:room.g.seq,now:T0+8000});ok(room.g.seenAt===T0+8000,'striker marks seen (question arrived 8 s late)');
ok(X({type:'seen',seq:room.g.seq,now:T0+9000}),'seen only once');
ok(X({type:'timeout',seq:room.g.seq,now:T0+(L+3)*1000+2000},'b'),'timeout counted from seen, not from delivery');
R({type:'batAns',choice:qs[room.g.set][qi].a,time:L-0.5,seq:room.g.seq});ok(room.g.last.kind==='runs'&&room.g.last.runs===1,'late-arriving question still answerable: 1 run');
ok(room.g.seenAt===0,'seen cleared after the ball');
// timeout allowed once really over
R({type:'rematch',now:1});R({type:'toss',coin:0.1,now:5});R({type:'tossChoice',choice:'bat',now:6});R({type:'start',sid:'m2',now:7});
ok(room.g.sid==='m2'&&room.g.seq===0,'rematch: new match id, seq restarts');
const q2=E.box(E.cur(room.g))[0];R({type:'pick',qi:q2,now:T0},'b');R({type:'bowlerAns',choice:qs[room.g.set][q2].a,now:T0},'b');
R({type:'seen',seq:room.g.seq,now:T0+200});
R({type:'timeout',seq:room.g.seq,now:T0+200+(L+3)*1000+6000},'b');ok(room.g.last.kind==='timeout','timeout works after reading+limit+grace');
console.log(fails?'FAILS '+fails:'ALL PASS');process.exit(fails?1:0);
