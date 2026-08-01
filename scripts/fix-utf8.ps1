param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$bytes = [System.IO.File]::ReadAllBytes($Path)
Write-Host "first bytes: $($bytes[0..7] -join ',')"

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    $enc = [System.Text.Encoding]::Unicode
} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    $enc = [System.Text.Encoding]::BigEndianUnicode
} else {
    $enc = [System.Text.Encoding]::UTF8
}

$text = $enc.GetString($bytes)
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($Path, $text, $utf8)

$after = [System.IO.File]::ReadAllBytes($Path)
Write-Host "after bytes: $($after[0..7] -join ',')"
