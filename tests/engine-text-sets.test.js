const E=require('../engine.js');
const qs={"ONE WORD QUESTIONS 1":Array.from({length:30},(_,i)=>({q:'Q'+i,ans:'A'+i,type:'text'}))};let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}};
let room=E.newRoom({code:'T',pid:'h',name:'H',now:1,solo:false,set:'ONE WORD QUESTIONS 1'});
const R=(a,by='h')=>{const r=E.reduce(room,Object.assign({by,now:5},a),qs); if(r.error) throw new Error(a.type+': '+r.error); room=r.room;};
const X=(a,by)=>E.reduce(room,Object.assign({by,now:5},a),qs).error;
R({type:'team',team:'A'});['a2','a3','a4'].forEach((p,i)=>{R({type:'join',pid:p,name:p,now:i+2});R({type:'team',team:'A'},p)});
R({type:'join',pid:'b1',name:'b1',now:9});R({type:'team',team:'B'},'b1');
ok(room.teams.A.captain==='h'&&room.teams.B.captain==='b1','captains');
ok(X({type:'set',name:'OPTIONAL QUESTIONS 1'},'h'),'unplayable set blocked');
ok(X({type:'start'},'a2'),'non-host start blocked');
R({type:'captain',team:'A',pid:'a2'});ok(room.teams.A.captain==='a2','captain change');
R({type:'start'});const inn=()=>E.cur(room.g);
ok(room.g.limit===60,'limit 60'); ok(inn().bowler==='b1','auto bowler (team of 1)');
ok(X({type:'setBatters',striker:'a3',non:'a4'},'a3'),'non-captain blocked');
R({type:'setBatters',striker:'a3',non:'a4'},'a2'); ok(room.g.phase==='select','select');
ok(X({type:'pick',qi:7},'b1'),'outside box blocked'); ok(X({type:'pick',qi:0},'a3'),'non bowler pick blocked');
R({type:'pick',qi:2},'b1'); R({type:'bowlerAns',ok:true},'b1'); ok(room.g.phase==='bat','bat');
ok(X({type:'batAns',text:'x',time:3},'a4'),'non-striker blocked');
R({type:'batAns',text:'A2',time:20,seq:room.g.seq},'a3'); ok(room.g.phase==='judge','judge');
ok(X({type:'judge',ok:true},'a3'),'batsman cannot judge');
R({type:'judge',ok:true},'b1'); ok(inn().runs===4,'20s of 60 -> 4 runs');
R({type:'pick',qi:0},'b1'); R({type:'bowlerAns',ok:true},'b1'); R({type:'batAns',text:'no',time:5,seq:room.g.seq},'a3'); R({type:'judge',ok:false},'b1');
ok(inn().wkts===1&&room.g.phase==='nextBatsman'&&room.g.chooser==='a3','next batsman chooser = out batsman: '+room.g.phase+' '+room.g.chooser);
ok(X({type:'nextBatsman',pid:'a4'},'a3'),'cannot pick non-striker');
R({type:'nextBatsman',pid:'h'},'a3'); ok(inn().striker==='h'&&inn().non==='a4','new batsman on strike');
// 1-member bowling team bowls all overs
for(let k=0;k<4;k++){const i=inn();const qi=E.box(i).find(x=>!i.used['q'+x]);R({type:'pick',qi},'b1');R({type:'bowlerAns',ok:true},'b1');R({type:'batAns',text:'y',time:59,seq:room.g.seq},i.striker);R({type:'judge',ok:true},'b1');}
ok(inn().balls===6&&room.g.phase==='select'&&inn().bowler==='b1','over 2 same bowler when team size 1: '+room.g.phase);
console.log(fails?'FAILS '+fails:'ALL OK');
