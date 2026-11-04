Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  $c = $_.CommandLine
  if ($c.Length -gt 150) { $c = $c.Substring(0, 150) }
  "{0} {1}" -f $_.ProcessId, $c
}
