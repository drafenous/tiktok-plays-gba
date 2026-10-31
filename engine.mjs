export const SETTINGS={afkMs:15000,maxTurnMs:120000,maxCommandsPerTurn:60,frames:8,commandDelayMs:180,maxQueuedUsers:100};
export function parseCommand(text){let m=String(text??'').trim().toLowerCase().match(/^!?(up|down|left|right|a|b|start|select|l|r)$/);return m?.[1]??null;}
export function createEngine({send,notify=()=>{},now=()=>Date.now(),settings=SETTINGS}){
 let active=null, queue=[], commands=[], totalProcessed=0, nextId=1, busy=false, lastByUser=new Map();
 function cleanName(x){return String(x??'anonimo').replace(/^@/,'').slice(0,32)||'anonimo';}
 function snapshot(){const t=now();return {mode:active?'exclusive':'collective',active:active?{user:active.user,remaining:active.credits,afkSeconds:Math.max(0,Math.ceil((active.afkAt-t)/1000)),turnSeconds:Math.max(0,Math.ceil((active.expiresAt-t)/1000))}:null,queue:queue.map(p=>({user:p.user,credits:p.credits})),commands:commands.slice(),updatedAt:t,totalProcessed};}
 function publish(){notify(snapshot());}
 function advance(reason='finished'){
  if(active)console.log(`[Turno] @${active.user} finalizado: ${reason}; saldo=${active.credits}`);
  active=null;
  while(queue.length&&!active){const p=queue.shift();if(p.credits>0)active={...p,afkAt:now()+settings.afkMs,expiresAt:now()+settings.maxTurnMs};}
  if(active)console.log(`[Turno] @${active.user} assumiu ${active.credits} comandos`);
  publish();
 }
 function tick(){if(!active)return;const t=now();if(t>=active.expiresAt)advance('tempo máximo');else if(t>=active.afkAt)advance('AFK');else publish();}
 function grant(user,credits){user=cleanName(user);credits=Math.floor(Number(credits));if(!Number.isSafeInteger(credits)||credits<=0||credits>100000)return {ok:false,reason:'créditos inválidos'};
  // Separate chunks ensure fairness, without creating one queue position per Rose.
  const allTurns=[];for(let remain=credits;remain>0;){let portion=Math.min(settings.maxCommandsPerTurn,remain);allTurns.push({id:nextId++,user,credits:portion});remain-=portion;}
  if(!active){active={...allTurns.shift(),afkAt:now()+settings.afkMs,expiresAt:now()+settings.maxTurnMs};}
  const existing=queue.filter(p=>p.user===user);const other=queue.filter(p=>p.user!==user);
  // Preserve order for existing users: append new credits after any existing turns.
  // Each grant creates at most one pending batch per turn; no one cuts in line.
  if(queue.length+allTurns.length>settings.maxQueuedUsers)return {ok:false,reason:'fila cheia'};
  queue.push(...allTurns);publish();return {ok:true,credits,turns:Math.ceil(credits/settings.maxCommandsPerTurn)};
 }
 async function input(user,text,{force=false}={}){
  const command=parseCommand(text);if(!command)return {ok:false,reason:'comando inválido'};
  user=cleanName(user);tick();if(active&&active.user.toLowerCase()!==user.toLowerCase()&&!force)return {ok:false,reason:'outro jogador está controlando'};
  const t=now();if(!force&&t-(lastByUser.get(user)??-100000)<600)return {ok:false,reason:'cooldown'};
  if(busy)return {ok:false,reason:'emulador ocupado'};
  busy=true;
  try {await send(command,settings.frames);lastByUser.set(user,t);totalProcessed++;commands.unshift({id:nextId++,user,command,time:now()});commands=commands.slice(0,8);
   if(active){active.credits--;active.afkAt=now()+settings.afkMs;if(active.credits<=0)advance('créditos esgotados');}publish();return {ok:true,command};
  } catch(e){return {ok:false,reason:`mGBA indisponível: ${e.message}`};}finally{busy=false;}
 }
 function status(){return snapshot();}
 return {grant,input,tick,status,advance};
}
