# TikTok Plays GBA 🎮

Projeto experimental para permitir que espectadores de uma **TikTok LIVE controlem jogos compatíveis com o mGBA** usando comandos no chat e presentes (*gifts*). Não é limitado a Pokémon: o mGBA suporta Game Boy, Game Boy Color e Game Boy Advance.

O sistema roda **localmente no Windows**, sem Docker, OBS ou chave RTMP. A transmissão é feita pelo **TikTok LIVE Studio**, enquanto Node.js recebe eventos da LIVE, controla o mGBA por uma bridge Lua/TCP e atualiza o overlay React em tempo real.

> **Projeto independente, não oficial.** Não tem afiliação com TikTok, Nintendo ou desenvolvedores dos jogos emulados. Use ROMs e artes que você tenha direito de utilizar. A licença do código não concede direitos sobre marcas, jogos, personagens ou imagens de terceiros.

## Como funciona

```text
TikTok LIVE (comentários e gifts)
             |
             v
Node.js + tiktok-live-connector
             |
             v
Motor de comandos e turnos ────> API/SSE ────> Overlay React (Vite)
             |
             v
Bridge Lua (TCP local: 8765)
             |
             v
mGBA ──────────────────────────> TikTok LIVE Studio
                                      (vídeo + overlay)
```

## Requisitos

- Windows e **Node.js 24+** com npm.
- [mGBA](https://mgba.io/downloads.html) com um jogo compatível, obtido legalmente.
- [TikTok LIVE Studio](https://www.tiktok.com/studio/download) e acesso à função LIVE para transmitir.
- Internet para integração com eventos reais do TikTok.

## Instalação

```powershell
npm install
```

Crie um arquivo **`.env`** na raiz do repositório, ou copie o **`.env.example`** e renomeie para **`.env`**, ao lado de `package.json`:

```dotenv
TIKTOK_USER=SEU_USUARIO
```

Substitua o valor da chave pelo usuário da conta que está transmitindo, **sem `@`**. O arquivo `.env` não deve ser versionado. Para conferir a leitura:

```powershell
node --env-file=.env -p "process.env.TIKTOK_USER"
```

> `--env-file=.env` exige que o arquivo exista. No PowerShell, uma variável de ambiente `TIKTOK_USER` já definida tem prioridade sobre o `.env`. Para limpá-la na sessão: `Remove-Item Env:TIKTOK_USER -ErrorAction SilentlyContinue`.

### Preparar o mGBA

1. Inicie o mGBA e carregue um jogo.
2. Abra **Tools → Scripting** e carregue `mgba-commands.lua`.
3. Deixe somente **uma instância** da bridge carregada, escutando em `127.0.0.1:8765`.
4. Abra o TikTok LIVE Studio e configure a captura da janela do mGBA.

## Comandos npm

Estes são os comandos do `package.json` atual informado para o projeto:

| Comando | O que executa |
| --- | --- |
| `npm run dev` | Backend com `--test` + Vite: **não conecta ao TikTok** |
| `npm run live` | Backend com `.env`, conexão real ao TikTok + Vite |
| `npm test` | Testes automatizados (`tests.mjs`) |
| `npm run build` | Compila o frontend Vite em `dist/` |

Se você aplicar também a proposta de scripts adicionais ao `package.json`, terá estes atalhos opcionais:

| Atalho adicional | O que executa |
| --- | --- |
| `npm run dev:server` | Somente backend em modo de teste |
| `npm run live:server` | Somente backend conectado à LIVE |
| `npm run dev:overlay` | Somente Vite/React |
| `npm run preview` | Prévia do build do frontend; **não inicia o backend** |

> **Importante:** os quatro atalhos adicionais só existirão se você os adicionar ao `package.json`. `npm run build` e `npm run preview` não conectam o frontend à API por conta própria; verifique o encaminhamento de `/api` para o backend na configuração de execução escolhida.

## Desenvolvimento e testes locais

Com o mGBA aberto e a bridge Lua carregada:

```powershell
npm run dev
```

Isso inicia o backend em modo de simulação e o Vite. Os comandos interativos `/gift` e `/as` podem não aceitar digitação quando ambos os processos rodam via `concurrently`. Para testar pelo terminal, abra **dois PowerShells** na pasta do projeto:

```powershell
# Terminal 1 — backend local, com stdin disponível
node --env-file=.env server.mjs --test
```

```powershell
# Terminal 2 — overlay
npx vite --host 127.0.0.1
```

No primeiro terminal:

```text
/gift ash 10      # concede 10 créditos simulados, não 10 moedas
/as ash right    # envia o comando como ash
/as ash a
/next            # passa para o próximo turno
/quit            # encerra o backend
```

**Atenção:** o comando `/gift ash 10` concede **10 créditos**, não simula um presente real de 10 moedas do TikTok.

Para prévia com dados fictícios, abra `http://127.0.0.1:5173/?demo=1`. Para visualizar o estado verdadeiro da API local, acesse `http://127.0.0.1:5173/`.

## Transmissão real

1. Inicie a LIVE pelo **TikTok LIVE Studio** com a captura do mGBA.
2. Confirme que a opção `enableExtendedGiftInfo: true` **não está ativada** no `server.mjs`. Nos testes anteriores, ela provocou bloqueio de assinatura no Euler Stream; a conexão do chat funcionou quando foi removida.
3. Encerre qualquer backend local já em execução e rode:

```powershell
npm run live
```

4. Adicione o overlay React como fonte web no LIVE Studio, **acima** da captura do mGBA. Não use `?demo=1` na transmissão.

A URL padrão do Vite é `http://127.0.0.1:5173/`. Se o LIVE Studio exigir um domínio personalizado, use o endereço local configurado no seu arquivo `hosts` e permita **somente esse host** em `vite.config.js` (`server.allowedHosts`). Evite `allowedHosts: true` e não exponha o servidor de desenvolvimento à rede pública.

A API local usa `http://127.0.0.1:3210`, e o overlay acompanha os estados via SSE em `/api/events`, com proxy do Vite para o backend.

## Comandos no chat

| Comentário | Ação |
| --- | --- |
| `up`, `down`, `left`, `right` | Direções |
| `a`, `b` | Botões A e B |
| `start`, `select` | Menu e seleção |
| `l`, `r` | Botões adicionais do GBA |

Algumas formas com prefixo `!` também são aceitas. Sem jogador exclusivo ativo, o chat compartilha o controle; havendo turno exclusivo, só os comandos do jogador ativo são executados.

## Gifts, combos e fila

**Regra experimental:** o motor tenta conceder **2 créditos por unidade de valor (`diamondCount`) reportada pelo conector**. Isso **não comprova** uma equivalência com moedas pagas, preço regional ou receita do criador.

- Um combo de presentes deve ser consolidado quando chegar o evento final; não se somam contagens cumulativas intermediárias.
- Cada turno tem até **60 comandos**; créditos maiores podem ser divididos em vários turnos.
- O jogador perde a vez após **15 segundos de inatividade** ou quando o turno atinge o limite de duração.
- Na implementação atual, eventos de gift **sem valor disponível** podem ser ignorados.
- Os testes com `/gift` confirmam a lógica local, **não** a monetização nem o tratamento de presentes reais em produção.

**Antes de receber gifts reais como créditos**, é importante validar o payload dos eventos e a consolidação dos combos, além de adicionar persistência em banco (a fila ainda fica em memória), deduplicação robusta e recuperação segura em caso de falhas. Créditos podem ser perdidos se o processo reiniciar ou o turno terminar; o comportamento ainda precisa de ajustes.

A biblioteca [`tiktok-live-connector`](https://www.npmjs.com/package/tiktok-live-connector) não é oficial e pode mudar sem aviso.

## Estrutura do projeto

```text
tiktok-plays-gba/
├── server.mjs           # API local, listener TikTok e bridge de comandos
├── engine.mjs           # Comandos, fila, créditos e AFK
├── mgba-commands.lua    # Recepção TCP e controle do emulador
├── send-command.ps1     # Teste isolado da bridge
├── src/
│   ├── main.jsx         # Overlay React
│   └── style.css        # Estilos
├── public/
│   └── overlay.png      # Arte do overlay (verificar licença)
├── vite.config.js
├── tests.mjs
├── package.json
├── .env                  # Variáveis locais: não versionar
├── .gitignore
├── LICENSE
└── README.md
```

## Segurança, limitações e próximos passos

- Mantenha a API e a bridge TCP acessíveis somente localmente.
- Salve o progresso normalmente no jogo e mantenha backups do `.sav` feitos em condições seguras.
- Não há proteção completa contra ações irreversíveis, como liberar Pokémon ou descartar itens.
- Persistência de turnos, integração de gifts reais, prevenção de duplicações e testes de reconexão são pendências antes de depender de monetização.
- O nome do repositório não significa vínculo oficial com TikTok nem com os fabricantes dos jogos.

## Licença

O código autoral do projeto pode ser distribuído sob os termos do arquivo [LICENSE](./LICENSE), se incluído pelo titular dos direitos. A licença não abrange ROMs, marcas e imagens de terceiros.
