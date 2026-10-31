-- Pokemon LIVE - mGBA command bridge (local TCP, Windows)
-- Start game first, then Tools > Scripting > File > Load Script
local PORT = 8765
local DEFAULT_FRAMES = 8
local MAX_FRAMES = 60

local keys = {
  up = C.GBA_KEY.UP, down = C.GBA_KEY.DOWN,
  left = C.GBA_KEY.LEFT, right = C.GBA_KEY.RIGHT,
  a = C.GBA_KEY.A, b = C.GBA_KEY.B,
  start = C.GBA_KEY.START, select = C.GBA_KEY.SELECT,
  l = C.GBA_KEY.L, r = C.GBA_KEY.R
}

local server, err = socket.bind("127.0.0.1", PORT)
if not server then
  console:error("Erro na porta " .. PORT .. ": " .. tostring(err))
  return
end
local ok, listenErr = server:listen(4)
if listenErr then
  console:error("Falha ao escutar: " .. tostring(listenErr))
  return
end

local clients = {}
local activeKey = nil
local remainingFrames = 0
local queue = {}

local function enqueue(line)
  local action, number = line:lower():match("^%s*(%a+)%s*(%d*)%s*$")
  if not action or not keys[action] then
    console:log("Comando ignorado: " .. line)
    return
  end
  local frames = tonumber(number) or DEFAULT_FRAMES
  frames = math.max(1, math.min(frames, MAX_FRAMES))
  if #queue >= 100 then
    console:log("Fila cheia: comando descartado")
    return
  end
  table.insert(queue, { key = keys[action], name = action, frames = frames })
end

local function onClientData(client)
  while true do
    local data, receiveErr = client.sock:receive(1024)
    if not data then
      if receiveErr ~= socket.ERRORS.AGAIN then
        clients[client] = nil
      end
      return
    end
    client.buffer = client.buffer .. data
    if #client.buffer > 4096 then
      client.buffer = ""
      return
    end
    while true do
      local newline = client.buffer:find("\n", 1, true)
      if not newline then break end
      local line = client.buffer:sub(1, newline - 1):gsub("\r", "")
      client.buffer = client.buffer:sub(newline + 1)
      enqueue(line)
    end
  end
end

server:add("received", function()
  local sock, acceptErr = server:accept()
  if not sock then
    console:log("Falha de conexao: " .. tostring(acceptErr))
    return
  end
  local client = { sock = sock, buffer = "" }
  clients[client] = true
  sock:add("received", function() onClientData(client) end)
  sock:add("error", function() clients[client] = nil end)
end)

callbacks:add("frame", function()
  if activeKey then
    remainingFrames = remainingFrames - 1
    if remainingFrames <= 0 then
      emu:clearKey(activeKey)
      activeKey = nil
    end
  end
  if not activeKey and #queue > 0 then
    local command = table.remove(queue, 1)
    activeKey = command.key
    remainingFrames = command.frames
    emu:addKey(activeKey)
    console:log("Executando " .. command.name .. " por " .. command.frames .. " frames")
  end
end)

console:log("Pokemon LIVE pronto: TCP 127.0.0.1:" .. PORT)
console:log("Comandos: up down left right a b start select l r [frames]")
