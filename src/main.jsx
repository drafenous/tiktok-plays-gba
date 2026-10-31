import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const demo = new URLSearchParams(window.location.search).has('demo');
const preview = {
  commands: [
    { user: 'drafenous', command: 'up', time: Date.now()-1000 },
    { user: 'ashbr', command: 'a', time: Date.now()-5000 },
    { user: 'pikachu_fan', command: 'right', time: Date.now()-12000 }
  ],
  active: { user: 'brock_master', remaining: 18, afkSeconds: 8 },
  queue: [{ user:'misty', credits: 20 }, { user:'redzin', credits: 10 }, {user:'jessie',credits:6}],
  mode: 'exclusive'
};
const keySymbols = { up:'↑', down:'↓', left:'←', right:'→', a:'A', b:'B', start:'ST', select:'SE', l:'L', r:'R' };
function age(t) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(t)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}
function App() {
  const [data,setData] = useState(demo ? preview : {commands:[], active:null, queue:[], mode:'collective'});
  const [,rerender] = useState(0);
  useEffect(() => {
    if (demo) return;
    const events = new EventSource('/api/events');
    events.onmessage = (event) => { try { setData(JSON.parse(event.data)); } catch (error) {console.warn('Evento inválido', error);} };
    return () => events.close();
  }, []);
  useEffect(() => {
    const id = setInterval(() => rerender(n=>n+1), 1000);
    return () => clearInterval(id);
  }, []);
  const commands = (data.commands || []).slice(0, 3);
  const waiting = (data.queue || []).slice(0, 2);
  return <main className="canvas" aria-label="Pokémon Yellow LIVE">
    <img src="/overlay.png" className="art" alt="" draggable="false" />
    <section className="commands" aria-label="Últimos comandos">
      {commands.length ? commands.map((c, i) => <div className="command" key={c.id || i}>
        <span className="key">{keySymbols[c.command] || '•'}</span>
        <span className="name">{c.user}</span>
        <span className="elapsed">{age(c.time)}</span>
      </div>) : <span className="placeholder">Aguardando comandos...</span>}
    </section>
    <section className="players" aria-label="Jogador atual e fila">
      {data.active ? <>
        <div className="now-label">JOGANDO AGORA</div>
        <div className="player-row current"><span className="name">@{data.active.user}</span><span className="credits">{data.active.remaining} cmd</span></div>
      </> : <div className="collective">CONTROLE COLETIVO</div>}
      <div className="next-label">PRÓXIMOS NA FILA</div>
      {waiting.length ? waiting.map((p,i) => <div className="player-row" key={`${p.user}-${i}`}>
        <span className="name">{i+1}. @{p.user}</span><span className="credits">{p.credits} cmd</span>
      </div>) : <span className="no-queue">Sem fila</span>}
      {(data.queue || []).length > 2 && <span className="extra">+{data.queue.length-2} aguardando</span>}
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
