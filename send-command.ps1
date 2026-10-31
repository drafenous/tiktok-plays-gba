param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('up','down','left','right','a','b','start','select','l','r')]
  [string]$Command,
  [Parameter(Position = 1)]
  [ValidateRange(1,60)]
  [int]$Frames = 8
)

$client = [System.Net.Sockets.TcpClient]::new()
try {
  $client.Connect('127.0.0.1', 8765)
  $stream = $client.GetStream()
  $bytes = [System.Text.Encoding]::ASCII.GetBytes("$Command $Frames`n")
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
  Write-Host "Enviado: $Command ($Frames frames)"
} finally {
  $client.Dispose()
}
