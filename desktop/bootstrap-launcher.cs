using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        try
        {
            var installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Lexorium"
            );

            Directory.CreateDirectory(installDir);
            ExtractPayload(installDir);

            var appPath = Path.Combine(installDir, "Lexorium.exe");
            if (!File.Exists(appPath))
            {
                throw new FileNotFoundException("Lexorium.exe was not found after extraction.", appPath);
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = appPath,
                WorkingDirectory = installDir,
                UseShellExecute = true,
            });

            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Lexorium could not start.\n\n" + ex.Message,
                "Lexorium Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }
    }

    private static void ExtractPayload(string installDir)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = assembly
            .GetManifestResourceNames()
            .FirstOrDefault(name => name.EndsWith("Lexorium.Payload.zip", StringComparison.OrdinalIgnoreCase));

        if (resourceName == null)
        {
            throw new InvalidOperationException("The embedded Lexorium payload could not be found.");
        }

        using (var stream = assembly.GetManifestResourceStream(resourceName))
        {
            if (stream == null)
            {
                throw new InvalidOperationException("The embedded Lexorium payload stream could not be opened.");
            }

            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (var entry in archive.Entries)
                {
                    var destinationPath = Path.Combine(
                        installDir,
                        entry.FullName.Replace('/', Path.DirectorySeparatorChar)
                    );

                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destinationPath);
                        continue;
                    }

                    var directory = Path.GetDirectoryName(destinationPath);
                    if (!string.IsNullOrEmpty(directory))
                    {
                        Directory.CreateDirectory(directory);
                    }

                    entry.ExtractToFile(destinationPath, true);
                }
            }
        }
    }
}
