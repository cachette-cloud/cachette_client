using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Cachette
{
    public class UninstallerForm : Form
    {
        private Button btnUninstall;
        private Button btnCancel;
        private Label lblTitle;
        private Label lblDesc;
        private ProgressBar progressBar;
        private string installDir;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UninstallerForm());
        }

        public UninstallerForm()
        {
            installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            this.Text = "Cachette Uninstall";
            this.Size = new Size(480, 240);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(18, 18, 18);
            this.ForeColor = Color.White;

            string icoPath = Path.Combine(installDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { }
            }

            lblTitle = new Label
            {
                Text = "Uninstall Cachette",
                Font = new Font("Segoe UI", 14, FontStyle.Bold),
                Location = new Point(24, 20),
                AutoSize = true,
                ForeColor = Color.White
            };

            lblDesc = new Label
            {
                Text = "Are you sure you want to completely remove Cachette and all of its components from your computer?",
                Font = new Font("Segoe UI", 9.5f),
                Location = new Point(24, 60),
                Size = new Size(420, 45),
                ForeColor = Color.FromArgb(180, 180, 180)
            };

            progressBar = new ProgressBar
            {
                Location = new Point(24, 115),
                Size = new Size(415, 20),
                Visible = false,
                Style = ProgressBarStyle.Marquee
            };

            btnUninstall = new Button
            {
                Text = "Uninstall",
                Location = new Point(245, 150),
                Size = new Size(95, 32),
                BackColor = Color.FromArgb(200, 35, 51),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnUninstall.FlatAppearance.BorderSize = 0;
            btnUninstall.Click += (s, e) => PerformUninstall();

            btnCancel = new Button
            {
                Text = "Cancel",
                Location = new Point(350, 150),
                Size = new Size(90, 32),
                BackColor = Color.FromArgb(40, 40, 40),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9),
                Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Click += (s, e) => this.Close();

            this.Controls.Add(lblTitle);
            this.Controls.Add(lblDesc);
            this.Controls.Add(progressBar);
            this.Controls.Add(btnUninstall);
            this.Controls.Add(btnCancel);
        }

        private void PerformUninstall()
        {
            btnUninstall.Enabled = false;
            btnCancel.Enabled = false;
            progressBar.Visible = true;
            lblDesc.Text = "Removing Cachette components and shortcuts...";

            try
            {
                // 1. Terminate running processes
                KillProcessByName("Cachette");

                // 2. Remove Shortcuts
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopShortcut = Path.Combine(desktop, "Cachette.lnk");
                if (File.Exists(desktopShortcut))
                {
                    try { File.Delete(desktopShortcut); } catch { }
                }

                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
                string startMenuDir = Path.Combine(startMenu, "Programs", "Cachette");
                if (Directory.Exists(startMenuDir))
                {
                    try { Directory.Delete(startMenuDir, true); } catch { }
                }

                // 3. Remove Registry Entry
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (key != null)
                        {
                            key.DeleteSubKeyTree("Cachette", false);
                        }
                    }
                }
                catch { }

                // 4. Schedule Directory Deletion via cmd
                string tempScript = Path.Combine(Path.GetTempPath(), "cachette_cleanup.bat");
                string scriptContent = string.Format(
                    "@echo off\r\n" +
                    "ping 127.0.0.1 -n 2 > nul\r\n" +
                    "taskkill /F /IM Cachette.exe > nul 2>&1\r\n" +
                    "rmdir /S /Q \"{0}\"\r\n" +
                    "del \"%~f0\"\r\n",
                    installDir
                );
                File.WriteAllText(tempScript, scriptContent);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/C \"" + tempScript + "\"",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);

                MessageBox.Show(
                    "Cachette has been successfully removed from your computer.",
                    "Uninstall Complete",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );

                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error during uninstallation: " + ex.Message,
                    "Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                this.Close();
            }
        }

        private void KillProcessByName(string processName)
        {
            try
            {
                Process[] procs = Process.GetProcessesByName(processName);
                for (int i = 0; i < procs.Length; i++)
                {
                    try
                    {
                        if (procs[i].Id != Process.GetCurrentProcess().Id)
                        {
                            procs[i].Kill();
                            procs[i].WaitForExit(2000);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
    }
}

