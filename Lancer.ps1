$app = Join-Path $PSScriptRoot 'index.html'
$icon = Join-Path $PSScriptRoot 'velocivector.ico'
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

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey
    {
        public Guid Format;
        public uint Id;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StringVariant
    {
        public ushort Type;
        private ushort reserved1, reserved2, reserved3;
        public IntPtr Value;
        private IntPtr padding;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        int GetCount(out uint count);
        int GetAt(uint index, out PropertyKey key);
        int GetValue(ref PropertyKey key, out StringVariant value);
        [PreserveSig]
        int SetValue(ref PropertyKey key, ref StringVariant value);
    }

    [DllImport("shell32.dll")]
    private static extern int SHGetPropertyStoreForWindow(
        IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);

    private static bool SetAppProperty(IPropertyStore store, uint id, string text)
    {
        var key = new PropertyKey { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id = id };
        var value = new StringVariant { Type = 31, Value = Marshal.StringToCoTaskMemUni(text) };
        try { return store.SetValue(ref key, ref value) >= 0; }
        finally { Marshal.FreeCoTaskMem(value.Value); }
    }

    public static bool SetTaskbarIcon(IntPtr window, string icon, string command)
    {
        IPropertyStore store;
        var iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(window, ref iid, out store) < 0) return false;
        try
        {
            // Set relaunch properties before assigning the taskbar group ID.
            return SetAppProperty(store, 2, command)
                && SetAppProperty(store, 3, icon + ",0")
                && SetAppProperty(store, 4, "Velocivector 2D CAD")
                && SetAppProperty(store, 5, "FablabAtelier.Velocivector2D");
        }
        finally { Marshal.ReleaseComObject(store); }
    }

    public static IntPtr[] Find()
    {
        var windows = new List<IntPtr>();
        EnumWindows((window, unused) =>
        {
            if (IsWindowVisible(window))
            {
                var title = new StringBuilder(512);
                GetWindowText(window, title, title.Capacity);
                if (title.ToString().StartsWith("Velocivector 0.1.0 alpha", StringComparison.OrdinalIgnoreCase))
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
$pluginRoot = Join-Path $PSScriptRoot 'plugins'
if (Test-Path -LiteralPath $pluginRoot) {
    $pluginIds = @(Get-ChildItem -LiteralPath $pluginRoot -Directory | Where-Object {
        $_.Name -cmatch '^[a-z][a-z0-9-]{0,47}$' -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'plugin.js') -PathType Leaf)
    } | Sort-Object Name | Select-Object -ExpandProperty Name)
    $url += '?plugins=' + [Uri]::EscapeDataString(($pluginIds -join ','))
}
if ($edge) {
    Start-Process -FilePath $edge -ArgumentList ('--start-maximized --app="{0}"' -f $url) -WindowStyle Maximized
} else {
    Start-Process -FilePath $app -WindowStyle Maximized
}

$deadline = [DateTime]::UtcNow.AddSeconds(15)
$window = [IntPtr]::Zero
$stable = 0
$iconApplied = $false
$launcher = Join-Path $PSScriptRoot 'Lancer.ps1'
$relaunch = 'powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $launcher
while ([DateTime]::UtcNow -lt $deadline) {
    $visible = [VelocivectorWindows]::Find()
    $newWindow = $visible | Where-Object { $_ -notin $existing } | Select-Object -First 1
    $foreground = [VelocivectorWindows]::GetForegroundWindow()
    $target = if ($newWindow) { $newWindow } elseif ($visible -contains $foreground) { $foreground }
    if ($target) {
        if ($target -ne $window) {
            $window = $target
            $stable = 0
            $iconApplied = $false
        }
        if ($edge -and -not $iconApplied -and (Test-Path -LiteralPath $icon)) {
            $iconApplied = [VelocivectorWindows]::SetTaskbarIcon($window, $icon, $relaunch)
        }
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
