$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot 'finto.ico'
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(12, 12, 48, 48, 180, 90)
$path.AddArc(196, 12, 48, 48, 270, 90)
$path.AddArc(196, 196, 48, 48, 0, 90)
$path.AddArc(12, 196, 48, 48, 90, 90)
$path.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(49, 92, 74))
$graphics.FillPath($brush, $path)

$font = New-Object System.Drawing.Font 'Georgia', 142, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 248, 242))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('F', $font, $textBrush, (New-Object System.Drawing.RectangleF 0, -3, 256, 256), $format)

$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create($output)
try { $icon.Save($stream) } finally { $stream.Dispose() }

$icon.Dispose()
$format.Dispose()
$textBrush.Dispose()
$font.Dispose()
$brush.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $output
