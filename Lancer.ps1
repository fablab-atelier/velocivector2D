$app = Join-Path $PSScriptRoot 'index.html'
$edge = @(${env:ProgramFiles(x86)}, $env:ProgramFiles) |
    Where-Object { $_ } |
    ForEach-Object { Join-Path $_ 'Microsoft\Edge\Application\msedge.exe' } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class VelocivectorWindows
{
    private delegate bool EnumWindowCallback(IntPtr window, IntPtr unused);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowCallback callback, IntPtr unused);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder title, int size);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    public static IntPtr[] Find()
    {
        var windows = new List<IntPtr>();
        EnumWindows((window, unused) =>
        {
            if (IsWindowVisible(window))
            {
                var title = new StringBuilder(512);
                GetWindowText(window, title, title.Capacity);
                if (title.ToString().StartsWith("Velocivector 2D CAD", StringComparison.OrdinalIgnoreCase))
                    windows.Add(window);
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static void Maximize(IntPtr window)
    {
        ShowWindowAsync(window, 3);
    }
}
'@

$existing = [VelocivectorWindows]::Find()
$url = ([Uri] $app).AbsoluteUri
if ($edge) {
    Start-Process -FilePath $edge -ArgumentList ('--start-maximized --app="{0}"' -f $url) -WindowStyle Maximized
} else {
    Start-Process -FilePath $app -WindowStyle Maximized
}

$deadline = [DateTime]::UtcNow.AddSeconds(15)
$window = [IntPtr]::Zero
$stable = 0
while ([DateTime]::UtcNow -lt $deadline) {
    $visible = [VelocivectorWindows]::Find()
    $newWindow = $visible | Where-Object { $_ -notin $existing } | Select-Object -First 1
    $foreground = [VelocivectorWindows]::GetForegroundWindow()
    $target = if ($newWindow) { $newWindow } elseif ($visible -contains $foreground) { $foreground }
    if ($target) {
        if ($target -ne $window) { $window = $target; $stable = 0 }
        if ([VelocivectorWindows]::IsZoomed($window)) {
            $stable++
            if ($stable -ge 6) { break }
        } else {
            $stable = 0
            [VelocivectorWindows]::Maximize($window)
        }
    } else {
        $stable = 0
    }
    Start-Sleep -Milliseconds 150
}
