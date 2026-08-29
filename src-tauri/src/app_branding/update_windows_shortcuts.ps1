# Mis a jour des raccourcis Windows (bureau, menu Demarrer, pins .lnk).
# Appele depuis app_branding/os.rs — ne pas lancer a la main.
param(
    [Parameter(Mandatory = $true)]
    [string]$JobPath
)

$ErrorActionPreference = "Stop"
$job = Get-Content -LiteralPath $JobPath -Raw -Encoding UTF8 | ConvertFrom-Json
$exe = [IO.Path]::GetFullPath([string]$job.exePath)
$icon = [string]$job.iconLocation
$displayStem = [string]$job.displayStem
$aumid = [string]$job.aumid
$updated = 0
$attempted = 0
$seen = @{}

$iconIndex = 0
$iconPath = $icon
if ($icon -match '^(.*),(-?\d+)$') {
    $iconPath = $Matches[1]
    $iconIndex = [int]$Matches[2]
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
internal class ShellLink { }

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, int fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
    void Resolve(IntPtr hwnd, int fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

[ComImport]
[Guid("0000010b-0000-0000-C000-000000000046")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct PROPERTYKEY {
    public Guid fmtid;
    public uint pid;
}

[StructLayout(LayoutKind.Explicit)]
internal struct PROPVARIANT {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointerValue;
}

[ComImport]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore {
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PROPERTYKEY pkey);
    void GetValue([In] ref PROPERTYKEY key, out PROPVARIANT pv);
    void SetValue([In] ref PROPERTYKEY key, [In] ref PROPVARIANT pv);
    void Commit();
}

public static class CrmLnkBrand {
    const ushort VT_LPWSTR = 31;
    static readonly Guid AppUserModel = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

    public static string GetTarget(string lnkPath) {
        var link = (IShellLinkW)new ShellLink();
        ((IPersistFile)link).Load(lnkPath, 0);
        var sb = new StringBuilder(1024);
        link.GetPath(sb, sb.Capacity, IntPtr.Zero, 1);
        if (sb.Length == 0) {
            link.GetPath(sb, sb.Capacity, IntPtr.Zero, 0);
        }
        return sb.ToString();
    }

    public static void Update(string lnkPath, string iconPath, int iconIndex, string description, string aumid) {
        var link = (IShellLinkW)new ShellLink();
        var file = (IPersistFile)link;
        file.Load(lnkPath, 0);
        if (!string.IsNullOrEmpty(iconPath)) {
            link.SetIconLocation(iconPath, iconIndex);
        }
        if (!string.IsNullOrEmpty(description)) {
            link.SetDescription(description);
        }
        if (!string.IsNullOrEmpty(aumid)) {
            SetStringProp((IPropertyStore)link, new PROPERTYKEY { fmtid = AppUserModel, pid = 5 }, aumid);
            SetStringProp((IPropertyStore)link, new PROPERTYKEY { fmtid = AppUserModel, pid = 7 }, iconPath + "," + iconIndex);
        }
        file.Save(lnkPath, true);
        Marshal.ReleaseComObject(link);
    }

    static void SetStringProp(IPropertyStore store, PROPERTYKEY key, string value) {
        if (string.IsNullOrEmpty(value)) return;
        var pv = new PROPVARIANT {
            vt = VT_LPWSTR,
            pointerValue = Marshal.StringToCoTaskMemUni(value)
        };
        try {
            store.SetValue(ref key, ref pv);
            store.Commit();
        } finally {
            Marshal.FreeCoTaskMem(pv.pointerValue);
        }
    }
}

public static class CrmShellNotify {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@

function Get-ScanRoots {
    $roots = New-Object System.Collections.Generic.List[object]
    function Add-Root([string]$path, [int]$depth) {
        if ($path -and (Test-Path -LiteralPath $path)) {
            $roots.Add([pscustomobject]@{ Path = $path; Depth = $depth }) | Out-Null
        }
    }

    Add-Root ([Environment]::GetFolderPath("Desktop")) 0
    Add-Root ([Environment]::GetFolderPath("CommonDesktopDirectory")) 0
    Add-Root ([Environment]::GetFolderPath("StartMenu")) 3
    Add-Root ([Environment]::GetFolderPath("CommonStartMenu")) 3
    Add-Root ([Environment]::GetFolderPath("Programs")) 2
    Add-Root ([Environment]::GetFolderPath("CommonPrograms")) 2

    if ($env:USERPROFILE) {
        Add-Root (Join-Path $env:USERPROFILE "OneDrive\Desktop") 0
        Add-Root (Join-Path $env:USERPROFILE "OneDrive\Bureau") 0
    }

    if ($env:APPDATA) {
        Add-Root (Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar") 0
        Add-Root (Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\ImplicitAppShortcuts") 2
    }
    return $roots
}

function Get-CanonicalPath([string]$path) {
    if (-not $path) { return $null }
    $trimmed = $path
    if ($trimmed.StartsWith("\\?\")) {
        $trimmed = $trimmed.Substring(4)
    }
    try { return [IO.Path]::GetFullPath($trimmed) } catch { return $trimmed }
}

function Test-CrmTarget([string]$lnkPath) {
    try {
        $t = [CrmLnkBrand]::GetTarget($lnkPath)
        if (-not $t) { return $false }
        $full = Get-CanonicalPath $t
        return ($full -ieq $exe)
    } catch {
        return $false
    }
}

function Update-CrmShortcut([string]$lnkPath) {
    $parent = [IO.Path]::GetDirectoryName($lnkPath)
    $dest = Join-Path $parent ($displayStem + ".lnk")
    $sameName = [string]::Equals($lnkPath, $dest, [StringComparison]::OrdinalIgnoreCase)

    if (-not $sameName -and (Test-Path -LiteralPath $dest)) {
        if (Test-CrmTarget $dest) {
            [CrmLnkBrand]::Update($dest, $iconPath, $iconIndex, $displayStem, $aumid)
            if (-not [string]::Equals($lnkPath, $dest, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $lnkPath -Force -ErrorAction SilentlyContinue
            }
            return
        }
        [CrmLnkBrand]::Update($lnkPath, $iconPath, $iconIndex, $displayStem, $aumid)
        return
    }

    [CrmLnkBrand]::Update($lnkPath, $iconPath, $iconIndex, $displayStem, $aumid)
    if (-not $sameName) {
        Rename-Item -LiteralPath $lnkPath -NewName ($displayStem + ".lnk")
    }
}

foreach ($root in Get-ScanRoots) {
    $items = @(Get-ChildItem -LiteralPath $root.Path -Filter *.lnk -File -Recurse -Depth $root.Depth -ErrorAction SilentlyContinue)
    foreach ($item in $items) {
        $path = $item.FullName
        $key = $path.ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        if (-not (Test-CrmTarget $path)) { continue }
        $seen[$key] = $true
        $attempted++
        try {
            Update-CrmShortcut $path
            $updated++
        } catch {
            Write-Warning ("shortcut {0}: {1}" -f $path, $_.Exception.Message)
        }
    }
}

if ($attempted -gt 0 -and $updated -eq 0) {
    throw "Aucun raccourci CRM n'a pu être mis à jour ($attempted tentative(s))."
}

try {
    [CrmShellNotify]::SHChangeNotify(0x8000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {
    Write-Warning $_.Exception.Message
}

Write-Output $updated
