using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Cachette
{
    public class InstallerForm : Form
    {
        private Label lblAppTitle;
        private Label lblSubtitle;
        private Label lblDestPrompt;
        private TextBox txtInstallPath;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;
        private Button btnInstall;
        private Button btnCancel;
        private ProgressBar progressBar;
        private Label lblStatus;
        private BackgroundWorker worker;
        private Panel headerPanel;
        private Panel footerPanel;
        private Panel contentPanel;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = false;
            string customDir = null;

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i].Equals("/S", StringComparison.OrdinalIgnoreCase) || args[i].Equals("/silent", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
                else if (args[i].StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
                {
                    customDir = args[i].Substring(3).Trim('"');
                }
            }

            if (silent)
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string targetDir = string.IsNullOrEmpty(customDir) ? Path.Combine(localAppData, "Cachette") : customDir;
                PerformSilentInstall(targetDir);
                return;
            }

            Application.Run(new InstallerForm());
        }

        private static void PerformSilentInstall(string targetDir)
        {
            try
            {
                Directory.CreateDirectory(targetDir);
                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream resStream = assembly.GetManifestResourceStream("Payload"))
                {
                    if (resStream != null)
                    {
                        using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string dest = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                                if (!dest.StartsWith(Path.GetFullPath(targetDir), StringComparison.OrdinalIgnoreCase)) continue;
                                if (string.IsNullOrEmpty(entry.Name))
                                {
                                    Directory.CreateDirectory(dest);
                                }
                                else
                                {
                                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                                    entry.ExtractToFile(dest, true);
                                }
                            }
                        }
                    }
                }
                SetupBackendWithUv(targetDir, null);
            }
            catch { }
        }

        public InstallerForm()
        {
            this.Text = "Cachette Setup";
            this.Size = new Size(540, 440);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(18, 18, 18);
            this.ForeColor = Color.White;

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string defaultPath = Path.Combine(localAppData, "Cachette");

            // Header Panel
            headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = Color.FromArgb(24, 24, 24)
            };

            lblAppTitle = new Label
            {
                Text = "Cachette Private Node Setup",
                Font = new Font("Segoe UI", 13.5f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(24, 16),
                AutoSize = true
            };

            lblSubtitle = new Label
            {
                Text = "Encrypted, decentralized zero-knowledge storage node",
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(160, 160, 160),
                Location = new Point(24, 44),
                AutoSize = true
            };

            headerPanel.Controls.Add(lblAppTitle);
            headerPanel.Controls.Add(lblSubtitle);

            // Footer Panel
            footerPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 65,
                BackColor = Color.FromArgb(24, 24, 24)
            };

            btnInstall = new Button
            {
                Text = "Install",
                Location = new Point(310, 16),
                Size = new Size(100, 34),
                BackColor = Color.FromArgb(255, 255, 255),
                ForeColor = Color.FromArgb(10, 10, 10),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += (s, e) => StartInstallation();

            btnCancel = new Button
            {
                Text = "Cancel",
                Location = new Point(420, 16),
                Size = new Size(90, 34),
                BackColor = Color.FromArgb(36, 36, 36),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9.5f),
                Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Click += (s, e) => this.Close();

            footerPanel.Controls.Add(btnInstall);
            footerPanel.Controls.Add(btnCancel);

            // Content Panel
            contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(24, 20, 24, 20),
                BackColor = Color.FromArgb(18, 18, 18)
            };

            lblDestPrompt = new Label
            {
                Text = "Install directory:",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(220, 220, 220),
                Location = new Point(24, 15),
                AutoSize = true
            };

            txtInstallPath = new TextBox
            {
                Text = defaultPath,
                Font = new Font("Segoe UI", 9.5f),
                Location = new Point(24, 40),
                Size = new Size(385, 26),
                BackColor = Color.FromArgb(30, 30, 30),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            btnBrowse = new Button
            {
                Text = "Browse...",
                Font = new Font("Segoe UI", 9),
                Location = new Point(420, 39),
                Size = new Size(85, 28),
                BackColor = Color.FromArgb(40, 40, 40),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnBrowse.FlatAppearance.BorderSize = 0;
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.SelectedPath = txtInstallPath.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallPath.Text = fbd.SelectedPath;
                    }
                }
            };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create desktop shortcut",
                Checked = true,
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(200, 200, 200),
                Location = new Point(24, 90),
                AutoSize = true
            };

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Create Start Menu shortcut",
                Checked = true,
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(200, 200, 200),
                Location = new Point(24, 120),
                AutoSize = true
            };

            chkLaunchAfter = new CheckBox
            {
                Text = "Launch Cachette after installation",
                Checked = true,
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(200, 200, 200),
                Location = new Point(24, 150),
                AutoSize = true
            };

            progressBar = new ProgressBar
            {
                Location = new Point(24, 195),
                Size = new Size(480, 22),
                Visible = false,
                Minimum = 0,
                Maximum = 100
            };

            lblStatus = new Label
            {
                Text = "Ready to install.",
                Font = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(150, 150, 150),
                Location = new Point(24, 225),
                Size = new Size(480, 25)
            };

            contentPanel.Controls.Add(lblDestPrompt);
            contentPanel.Controls.Add(txtInstallPath);
            contentPanel.Controls.Add(btnBrowse);
            contentPanel.Controls.Add(chkDesktopShortcut);
            contentPanel.Controls.Add(chkStartMenuShortcut);
            contentPanel.Controls.Add(chkLaunchAfter);
            contentPanel.Controls.Add(progressBar);
            contentPanel.Controls.Add(lblStatus);

            this.Controls.Add(contentPanel);
            this.Controls.Add(headerPanel);
            this.Controls.Add(footerPanel);

            // Background worker
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        private void StartInstallation()
        {
            string targetDir = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Please specify a valid installation directory.", "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            btnBrowse.Enabled = false;
            txtInstallPath.Enabled = false;
            chkDesktopShortcut.Enabled = false;
            chkStartMenuShortcut.Enabled = false;
            chkLaunchAfter.Enabled = false;

            progressBar.Visible = true;
            lblStatus.Text = "Starting installation...";

            worker.RunWorkerAsync(new object[] {
                targetDir,
                chkDesktopShortcut.Checked,
                chkStartMenuShortcut.Checked,
                chkLaunchAfter.Checked
            });
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            object[] args = (object[])e.Argument;
            string targetDir = (string)args[0];
            bool desktopShortcut = (bool)args[1];
            bool startMenuShortcut = (bool)args[2];
            bool launchAfter = (bool)args[3];

            Directory.CreateDirectory(targetDir);

            // Extract embedded payload resource
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream resStream = assembly.GetManifestResourceStream("Payload"))
            {
                if (resStream != null)
                {
                    using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                    {
                        int total = archive.Entries.Count;
                        int count = 0;

                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            count++;
                            int percent = (int)(((float)count / Math.Max(1, total)) * 90);
                            worker.ReportProgress(percent, "Extracting: " + entry.FullName);

                            string destinationPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                            if (!destinationPath.StartsWith(Path.GetFullPath(targetDir), StringComparison.OrdinalIgnoreCase))
                            {
                                continue; // Path traversal protection
                            }

                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destinationPath);
                            }
                            else
                            {
                                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                                entry.ExtractToFile(destinationPath, true);
                            }
                        }
                    }
                }
                else
                {
                    worker.ReportProgress(20, "Configuring files...");
                }
            }

            worker.ReportProgress(92, "Setting up configuration and shortcuts...");

            // Ensure configuration files (.env)
            CreateEnvFiles(targetDir);

            // Configure backend environment via uv
            SetupBackendWithUv(targetDir, worker);

            // Shortcuts
            string exePath = Path.Combine(targetDir, "Cachette.exe");
            string icoPath = Path.Combine(targetDir, "app.ico");

            if (desktopShortcut)
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateShortcut(Path.Combine(desktop, "Cachette.lnk"), exePath, targetDir, icoPath, "Cachette Private Node");
            }

            if (startMenuShortcut)
            {
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
                string appGroup = Path.Combine(startMenu, "Programs", "Cachette");
                Directory.CreateDirectory(appGroup);
                CreateShortcut(Path.Combine(appGroup, "Cachette.lnk"), exePath, targetDir, icoPath, "Cachette Private Node");
                string uninstallerExe = Path.Combine(targetDir, "Uninstall.exe");
                if (File.Exists(uninstallerExe))
                {
                    CreateShortcut(Path.Combine(appGroup, "Uninstall Cachette.lnk"), uninstallerExe, targetDir, uninstallerExe, "Uninstall Cachette");
                }
            }

            // Register in Windows Add/Remove Programs
            RegisterInUninstall(targetDir);

            worker.ReportProgress(100, "Installation completed.");
            e.Result = launchAfter;
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            if (e.UserState != null)
            {
                lblStatus.Text = e.UserState.ToString();
            }
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Error != null)
            {
                MessageBox.Show("Installation encountered an error: " + e.Error.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnCancel.Text = "Close";
                btnCancel.Enabled = true;
                return;
            }

            bool launchAfter = (bool)e.Result;
            string targetDir = txtInstallPath.Text.Trim();
            string exePath = Path.Combine(targetDir, "Cachette.exe");

            if (launchAfter && File.Exists(exePath))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exePath)
                    {
                        WorkingDirectory = targetDir
                    };
                    Process.Start(psi);
                }
                catch { }
            }

            MessageBox.Show("Cachette has been successfully installed on your computer!", "Installation Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            this.Close();
        }

        private static void SetupBackendWithUv(string targetDir, BackgroundWorker bgWorker)
        {
            try
            {
                string uvExe = Path.Combine(targetDir, "data", "bin", "uv.exe");
                string backendDir = Path.Combine(targetDir, "backend");
                string venvDir = Path.Combine(backendDir, ".venv");
                string reqTxt = Path.Combine(backendDir, "requirements.txt");

                if (!File.Exists(uvExe))
                {
                    uvExe = "uv";
                }

                if (File.Exists(reqTxt) && !Directory.Exists(venvDir))
                {
                    if (bgWorker != null) bgWorker.ReportProgress(94, "Creating Python environment via uv...");

                    ProcessStartInfo venvPsi = new ProcessStartInfo
                    {
                        FileName = uvExe,
                        Arguments = "venv \"" + venvDir + "\"",
                        WorkingDirectory = backendDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process vp = Process.Start(venvPsi);
                    if (vp != null) vp.WaitForExit(30000);

                    string venvPython = Path.Combine(venvDir, "Scripts", "python.exe");
                    if (File.Exists(venvPython))
                    {
                        if (bgWorker != null) bgWorker.ReportProgress(96, "Installing backend dependencies via uv...");
                        ProcessStartInfo pipPsi = new ProcessStartInfo
                        {
                            FileName = uvExe,
                            Arguments = "pip install -r \"" + reqTxt + "\" --python \"" + venvPython + "\"",
                            WorkingDirectory = backendDir,
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            WindowStyle = ProcessWindowStyle.Hidden
                        };
                        Process pp = Process.Start(pipPsi);
                        if (pp != null) pp.WaitForExit(90000);

                        ProcessStartInfo alembicPsi = new ProcessStartInfo
                        {
                            FileName = venvPython,
                            Arguments = "-m alembic upgrade head",
                            WorkingDirectory = backendDir,
                            CreateNoWindow = true,
                            UseShellExecute = false,
                            WindowStyle = ProcessWindowStyle.Hidden
                        };
                        Process ap = Process.Start(alembicPsi);
                        if (ap != null) ap.WaitForExit(30000);
                    }
                }
            }
            catch { }
        }

        private void CreateEnvFiles(string targetDir)
        {
            // Root .env
            string rootEnv = Path.Combine(targetDir, ".env");
            if (!File.Exists(rootEnv))
            {
                File.WriteAllText(rootEnv,
                    "DATABASE_URL=sqlite+aiosqlite:///./cachette.db\r\n" +
                    "S3_ENDPOINT_URL=http://127.0.0.1:9002\r\n" +
                    "AWS_ACCESS_KEY_ID=minioadmin\r\n" +
                    "AWS_SECRET_ACCESS_KEY=minioadmin\r\n" +
                    "AWS_REGION=us-east-1\r\n" +
                    "S3_BUCKET_NAME=cachette-files\r\n" +
                    "CF_TUNNEL_TOKEN=\r\n"
                );
            }

            // Backend .env
            string backendEnv = Path.Combine(targetDir, "backend", ".env");
            if (!File.Exists(backendEnv))
            {
                string bDir = Path.GetDirectoryName(backendEnv);
                if (!Directory.Exists(bDir)) Directory.CreateDirectory(bDir);
                File.WriteAllText(backendEnv,
                    "DATABASE_URL=sqlite+aiosqlite:///./cachette.db\r\n" +
                    "S3_ENDPOINT_URL=http://127.0.0.1:9002\r\n" +
                    "AWS_ACCESS_KEY_ID=minioadmin\r\n" +
                    "AWS_SECRET_ACCESS_KEY=minioadmin\r\n" +
                    "AWS_REGION=us-east-1\r\n" +
                    "S3_BUCKET_NAME=cachette-files\r\n" +
                    "CF_TUNNEL_TOKEN=\r\n" +
                    "CENTRAL_URL=https://cachette.cloud\r\n"
                );
            }

            // Frontend .env
            string frontendEnv = Path.Combine(targetDir, "frontend", ".env");
            if (!File.Exists(frontendEnv))
            {
                string fDir = Path.GetDirectoryName(frontendEnv);
                if (!Directory.Exists(fDir)) Directory.CreateDirectory(fDir);
                File.WriteAllText(frontendEnv,
                    "BACKEND_URL=http://127.0.0.1:8000\r\n" +
                    "NEXT_PUBLIC_CENTRAL_URL=https://cachette.cloud\r\n"
                );
            }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconLocation, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                if (shortcut == null) return;

                Type scType = shortcut.GetType();
                scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                if (File.Exists(iconLocation))
                {
                    scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconLocation });
                }
                scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch { }
        }

        private void RegisterInUninstall(string targetDir)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Cachette"))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "Cachette Node");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "Cachette");
                        key.SetValue("InstallLocation", targetDir);
                        string icoPath = Path.Combine(targetDir, "app.ico");
                        if (File.Exists(icoPath))
                        {
                            key.SetValue("DisplayIcon", icoPath);
                        }
                        string uninst = Path.Combine(targetDir, "Uninstall.exe");
                        key.SetValue("UninstallString", "\"" + uninst + "\"");
                        key.SetValue("QuietUninstallString", "\"" + uninst + "\"");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
                SetupBackendWithUv(targetDir, null);
            }
            catch { }
        }
    }
}
