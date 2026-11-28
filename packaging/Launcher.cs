using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Velocivector 0.1.0 alpha")]
[assembly: System.Reflection.AssemblyProduct("Velocivector 0.1.0 alpha")]
[assembly: System.Reflection.AssemblyFileVersion("0.1.0.0")]
[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]
[assembly: System.Reflection.AssemblyInformationalVersion("0.1.0-alpha")]

internal static class Launcher
{
    private const string Title = "Velocivector 0.1.0 alpha";
    private static readonly Regex PluginId = new Regex(@"\A[a-z][a-z0-9-]{0,47}\z");

    [STAThread]
    public static int Main(string[] args)
    {
        var french = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fr";
        try
        {
            string installation = AppDomain.CurrentDomain.BaseDirectory;
            string application = Path.Combine(installation, "app");
            string settings = Path.Combine(installation, "plugins-folder.txt");
            string personal = File.Exists(settings) ? File.ReadAllText(settings, Encoding.UTF8).Trim() :
                Path.Combine(installation, "plugins-personnels");

            if (Array.IndexOf(args, "--plugins-folder") >= 0)
            {
                using (var picker = new FolderBrowserDialog())
                {
                    picker.Description = french
                        ? "Choisissez un dossier de plugins personnels. Seuls les plugins auxquels vous faites confiance doivent y être placés."
                        : "Choose a personal plugins folder. Only place plugins you trust in this folder.";
                    if (Directory.Exists(personal)) picker.SelectedPath = personal;
                    if (picker.ShowDialog() != DialogResult.OK) return 0;
                    personal = ValidatePersonalFolder(picker.SelectedPath, installation);
                    File.WriteAllText(settings, personal, new UTF8Encoding(true));
                }
                return 0;
            }

            string page = Path.Combine(application, "index.html");
            if (!File.Exists(page))
                throw new FileNotFoundException(french
                    ? "La page de Velocivector est absente. Réinstallez Velocivector dans le même dossier."
                    : "The Velocivector page is missing. Reinstall Velocivector to the same folder.", page);
            personal = ValidatePersonalFolder(personal, installation);
            Directory.CreateDirectory(personal);
            var stock = new HashSet<string>(File.ReadAllLines(Path.Combine(application, "stock-plugins.txt")), StringComparer.Ordinal);
            var custom = new List<string>();
            foreach (var folder in Directory.GetDirectories(personal))
            {
                string id = Path.GetFileName(folder);
                if (PluginId.IsMatch(id) && !stock.Contains(id) &&
                    (File.GetAttributes(folder) & FileAttributes.ReparsePoint) == 0 &&
                    File.Exists(Path.Combine(folder, "plugin.js")))
                    custom.Add(id);
            }
            custom.Sort(StringComparer.Ordinal);
            var ids = new List<string>(stock);
            ids.Sort(StringComparer.Ordinal);
            ids.AddRange(custom);
            string url = BuildApplicationUrl(page, personal, ids, custom);
            string edge = FindEdge();
            if (edge == null)
            {
                MessageBox.Show(french
                    ? "Microsoft Edge 109 ou ultérieur est nécessaire. Installez une version compatible avec votre Windows."
                    : "Microsoft Edge 109 or later is required. Install a version compatible with your Windows release.",
                    Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 2;
            }
            string profile = Path.Combine(installation, "Profil");
            Process.Start(new ProcessStartInfo(edge,
                "--start-maximized --no-first-run --user-data-dir=\"" + profile + "\" --app=\"" + url + "\"")
                { UseShellExecute = false, WorkingDirectory = installation });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show((french ? "Impossible de lancer Velocivector.\n\n" : "Could not start Velocivector.\n\n") + error.Message,
                Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    internal static string BuildApplicationUrl(string page, string personal, List<string> plugins, List<string> custom)
    {
        // .NET Framework treats a UriBuilder query on file URIs as part of the filename.
        return new Uri(page).AbsoluteUri + "?plugins=" + Uri.EscapeDataString(string.Join(",", plugins.ToArray())) +
            "&personalPlugins=" + Uri.EscapeDataString(string.Join(",", custom.ToArray())) +
            "&personalRoot=" + Uri.EscapeDataString(new Uri(personal + Path.DirectorySeparatorChar).AbsoluteUri);
    }

    private static string ValidatePersonalFolder(string path, string installation)
    {
        string full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        string app = Path.Combine(installation, "app");
        string profile = Path.Combine(installation, "Profil");
        if (full.Length < 3 || full[1] != ':' ||
            full.Equals(installation.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase) ||
            IsInside(full, app) || IsInside(full, profile))
            throw new ArgumentException("Dossier de plugins personnels invalide / Invalid personal plugins folder.");
        return full;
    }

    private static bool IsInside(string path, string root)
    {
        return path.Equals(root, StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private static string FindEdge()
    {
        foreach (var folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetEnvironmentVariable("ProgramW6432"), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) })
        {
            if (string.IsNullOrEmpty(folder)) continue;
            string path = Path.Combine(folder, "Microsoft", "Edge", "Application", "msedge.exe");
            if (File.Exists(path) && FileVersionInfo.GetVersionInfo(path).FileMajorPart >= 109) return path;
        }
        return null;
    }
}
