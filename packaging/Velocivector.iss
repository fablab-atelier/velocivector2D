#define ProductDisplayName "Velocivector 0.1.0 alpha"
[Setup]
AppId={{F9BE1DE7-3CFD-4520-B3D5-385AAE0C7AFF}
AppName={#ProductDisplayName}
AppVersion=0.1.0
AppVerName={#ProductDisplayName}
VersionInfoVersion=0.1.0.0
VersionInfoDescription={#ProductDisplayName}
VersionInfoProductName={#ProductDisplayName}
UninstallDisplayName={#ProductDisplayName}
DefaultDirName={localappdata}\Velocivector2D
DefaultGroupName=Velocivector 2D CAD
DisableDirPage=no
PrivilegesRequired=lowest
MinVersion=6.1sp1
WizardStyle=modern
SetupIconFile=..\velocivector.ico
UninstallDisplayIcon={app}\Velocivector.exe
LicenseFile=..\LICENSE
Compression=lzma2
SolidCompression=yes
OutputDir=..\releases
#ifdef SignedBuild
OutputBaseFilename=Velocivector-Alpha-0.1.0-Windows
SignTool=ReleaseSign
SignedUninstaller=yes
#else
OutputBaseFilename=Velocivector-Alpha-0.1.0-Windows-TEST-NON-SIGNE
#endif

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
en.PluginTitle=Personal plugins
fr.PluginTitle=Plugins personnels
en.PluginDescription=Choose where to keep generated and imported plugins.
fr.PluginDescription=Choisissez où conserver les plugins créés et importés.
en.PluginHint=Only select a folder containing plugins you trust. This folder is preserved during updates and uninstall.
fr.PluginHint=Choisissez un dossier dont vous approuvez les plugins. Il est conservé lors des mises à jour et de la désinstallation.
en.InvalidFolder=Choose a folder on a local drive outside the application and browser profile folders.
fr.InvalidFolder=Choisissez un dossier sur un lecteur local, en dehors des dossiers du programme et du profil du navigateur.
en.PluginShortcut=Change personal plugins folder
fr.PluginShortcut=Changer le dossier des plugins personnels
en.Launch=Open {#ProductDisplayName}
fr.Launch=Ouvrir {#ProductDisplayName}

[Files]
Source: ".build\Velocivector.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: ".build\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Velocivector 2D CAD"; Filename: "{app}\Velocivector.exe"; Comment: "{#ProductDisplayName}"
Name: "{group}\{cm:PluginShortcut}"; Filename: "{app}\Velocivector.exe"; Parameters: "--plugins-folder"

[Run]
Filename: "{app}\Velocivector.exe"; Description: "{cm:Launch}"; Flags: nowait postinstall skipifsilent

[Code]
var
  PluginPage: TInputDirWizardPage;

function ConfigFile: String;
begin
  Result := AddBackslash(WizardDirValue) + 'plugins-folder.txt';
end;

function DefaultPluginFolder: String;
begin
  Result := AddBackslash(WizardDirValue) + 'plugins-personnels';
end;

procedure LoadPluginFolder;
var
  Saved: TArrayOfString;
begin
  if LoadStringsFromFile(ConfigFile, Saved) and (GetArrayLength(Saved) > 0) then
    PluginPage.Values[0] := Saved[0]
  else
    PluginPage.Values[0] := DefaultPluginFolder;
end;

procedure InitializeWizard;
begin
  PluginPage := CreateInputDirPage(wpSelectDir, CustomMessage('PluginTitle'),
    CustomMessage('PluginDescription'), CustomMessage('PluginHint'), False, '');
  PluginPage.Add('');
  LoadPluginFolder;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = PluginPage.ID) and WizardSilent;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Selected, InstallRoot: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then LoadPluginFolder;
  if CurPageID = PluginPage.ID then begin
    Selected := RemoveBackslashUnlessRoot(Trim(PluginPage.Values[0]));
    InstallRoot := Lowercase(RemoveBackslashUnlessRoot(WizardDirValue));
    Result := (Length(Selected) > 3) and (Copy(Selected, 2, 2) = ':\') and
      (Pos('\..\', AddBackslash(Selected)) = 0) and
      (CompareText(Selected, InstallRoot) <> 0) and
      (Pos(InstallRoot + '\app\', AddBackslash(Lowercase(Selected))) <> 1) and
      (Pos(InstallRoot + '\profil\', AddBackslash(Lowercase(Selected))) <> 1);
    if not Result then MsgBox(CustomMessage('InvalidFolder'), mbError, MB_OK);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Selected: TArrayOfString;
begin
  if CurStep = ssPostInstall then begin
    SetArrayLength(Selected, 1);
    Selected[0] := Trim(PluginPage.Values[0]);
    if WizardSilent or (Selected[0] = '') then begin
      if FileExists(ConfigFile) then Exit;
      Selected[0] := DefaultPluginFolder;
    end;
    if not ForceDirectories(Selected[0]) or not SaveStringsToUTF8File(ConfigFile, Selected, False) then
      RaiseException(CustomMessage('InvalidFolder'));
  end;
end;
