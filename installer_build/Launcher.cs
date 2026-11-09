using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Cachette
{
    public class LauncherApp : ApplicationContext
    {
        private static Mutex singleInstanceMutex;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private Process backendProcess;
        private Process frontendProcess;
        private IntPtr jobHandle;
        private string appDir;
        private System.Windows.Forms.Timer healthTimer;

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public Int64 PerProcessUserTimeLimit;
            public Int64 PerJobUserTimeLimit;
            public UInt32 LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public UInt32 ActiveProcessLimit;
            public UIntPtr Affinity;
            public UInt32 PriorityClass;
            public UInt32 SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public UInt64 ReadOperationCount;
            public UInt64 WriteOperationCount;
            public UInt64 OtherOperationCount;
            public UInt64 ReadTransferCount;
            public UInt64 WriteTransferCount;
            public UInt64 OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryLimit;
            public UIntPtr PeakJobMemoryLimit;
        }

        const int JobObjectExtendedLimitInformation = 9;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [STAThread]
        public static void Main(string[] args)
        {
            bool createdNew;
            singleInstanceMutex = new Mutex(true, "CachetteNodeSingleInstance_Mutex", out createdNew);
            if (!createdNew)
            {
                // Already running
                try
                {
                    Process.Start("http://localhost:3000");
                }
                catch { }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherApp());
        }

        public LauncherApp()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            InitJobObject();
            InitTray();
            StartServices();

            // Open dashboard in browser after brief delay to allow services to bind
            var openTimer = new System.Windows.Forms.Timer();
            openTimer.Interval = 2800;
            openTimer.Tick += (s, e) =>
            {
                openTimer.Stop();
                openTimer.Dispose();
                OpenDashboard();
            };
            openTimer.Start();
        }

        private void InitJobObject()
        {
            try
            {
                jobHandle = CreateJobObject(IntPtr.Zero, null);
                if (jobHandle != IntPtr.Zero)
                {
                    JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                    int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                    IntPtr extendedInfoPtr = Marshal.AllocHGlobal(length);
                    try
                    {
                        Marshal.StructureToPtr(info, extendedInfoPtr, false);
                        SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation, extendedInfoPtr, (uint)length);
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(extendedInfoPtr);
                    }
                }
            }
            catch { }
        }

        private void BindToJob(Process proc)
        {
            if (proc != null && !proc.HasExited && jobHandle != IntPtr.Zero)
            {
                try
                {
                    AssignProcessToJobObject(jobHandle, proc.Handle);
                }
                catch { }
            }
        }

        private void InitTray()
        {
            trayMenu = new ContextMenuStrip();
            var titleItem = new ToolStripMenuItem("Cachette Node") { Enabled = false };
            var openItem = new ToolStripMenuItem("Open Web UI", null, (s, e) => OpenDashboard());
            var openFolderItem = new ToolStripMenuItem("Open App Folder", null, (s, e) => OpenAppFolder());
            var restartItem = new ToolStripMenuItem("Restart Services", null, (s, e) => RestartServices());
            var exitItem = new ToolStripMenuItem("Exit Cachette", null, (s, e) => Exit());

            trayMenu.Items.Add(titleItem);
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add(openItem);
            trayMenu.Items.Add(openFolderItem);
            trayMenu.Items.Add(restartItem);
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add(exitItem);

            Icon icon = SystemIcons.Application;
            string icoPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { icon = new Icon(icoPath); } catch { }
            }

            trayIcon = new NotifyIcon
            {
                Icon = icon,
                ContextMenuStrip = trayMenu,
                Text = "Cachette Node (Running)",
                Visible = true
            };

            trayIcon.DoubleClick += (s, e) => OpenDashboard();
        }

        private void StartServices()
        {
            EnsureSetup();
            StartBackend();
            StartFrontend();
        }

        private void EnsureSetup()
        {
            try
            {
                string backendDir = Path.Combine(appDir, "backend");
                string backendVenv = Path.Combine(backendDir, ".venv");
                string frontendDir = Path.Combine(appDir, "frontend");
                string frontendModules = Path.Combine(frontendDir, "node_modules");
                string uvExe = Path.Combine(appDir, "data", "bin", "uv.exe");
                string reqTxt = Path.Combine(backendDir, "requirements.txt");

                if (!Directory.Exists(backendVenv) && File.Exists(reqTxt))
                {
                    if (trayIcon != null)
                    {
                        trayIcon.ShowBalloonTip(4000, "Cachette Setup", "Creating Python environment via uv...", ToolTipIcon.Info);
                    }

                    string uvCmd = File.Exists(uvExe) ? uvExe : "uv";
                    ProcessStartInfo venvPsi = new ProcessStartInfo
                    {
                        FileName = uvCmd,
                        Arguments = "venv \"" + backendVenv + "\"",
                        WorkingDirectory = backendDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process vp = Process.Start(venvPsi);
                    if (vp != null) vp.WaitForExit(30000);

                    string venvPython = Path.Combine(backendVenv, "Scripts", "python.exe");
                    if (File.Exists(venvPython))
                    {
                        ProcessStartInfo pipPsi = new ProcessStartInfo
                        {
                            FileName = uvCmd,
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

                string setupScript = Path.Combine(appDir, "setup.ps1");
                if (!Directory.Exists(frontendModules) && File.Exists(setupScript))
                {
                    if (trayIcon != null)
                    {
                        trayIcon.ShowBalloonTip(4000, "Cachette Setup", "Installing frontend dependencies...", ToolTipIcon.Info);
                    }

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        Arguments = "-ExecutionPolicy Bypass -NoProfile -File \"" + setupScript + "\"",
                        WorkingDirectory = appDir,
                        UseShellExecute = true,
                        WindowStyle = ProcessWindowStyle.Normal
                    };
                    Process p = Process.Start(psi);
                    if (p != null)
                    {
                        p.WaitForExit();
                    }
                }
            }
            catch (Exception ex)
            {
                Log("EnsureSetup error: " + ex.Message);
            }
        }

        private void StartBackend()
        {
            try
            {
                string backendDir = Path.Combine(appDir, "backend");
                if (!Directory.Exists(backendDir)) return;

                string pythonPath = Path.Combine(backendDir, ".venv", "Scripts", "python.exe");
                if (!File.Exists(pythonPath))
                {
                    // Fallback to system python
                    pythonPath = "python";
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = pythonPath,
                    Arguments = "-m uvicorn app.main:app --port 8000",
                    WorkingDirectory = backendDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                backendProcess = Process.Start(psi);
                BindToJob(backendProcess);
            }
            catch (Exception ex)
            {
                Log("Backend start error: " + ex.Message);
            }
        }

        private void StartFrontend()
        {
            try
            {
                string frontendDir = Path.Combine(appDir, "frontend");
                if (!Directory.Exists(frontendDir)) return;

                // Priority 1: Standalone server if compiled
                string standaloneServer = Path.Combine(frontendDir, ".next", "standalone", "server.js");
                if (File.Exists(standaloneServer))
                {
                    ProcessStartInfo psiNode = new ProcessStartInfo
                    {
                        FileName = "node",
                        Arguments = "\"" + standaloneServer + "\"",
                        WorkingDirectory = frontendDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    frontendProcess = Process.Start(psiNode);
                    BindToJob(frontendProcess);
                    return;
                }

                // Ensure production build exists; if not, build first!
                string buildManifest = Path.Combine(frontendDir, ".next", "BUILD_ID");
                if (!File.Exists(buildManifest))
                {
                    if (trayIcon != null)
                    {
                        trayIcon.ShowBalloonTip(4000, "Cachette", "Building frontend production assets...", ToolTipIcon.Info);
                    }

                    ProcessStartInfo buildPsi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/C npm run build",
                        WorkingDirectory = frontendDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process bp = Process.Start(buildPsi);
                    if (bp != null)
                    {
                        bp.WaitForExit();
                    }
                }

                // Always run production server: npm run start
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/C npm run start",
                    WorkingDirectory = frontendDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                frontendProcess = Process.Start(psi);
                BindToJob(frontendProcess);
            }
            catch (Exception ex)
            {
                Log("Frontend start error: " + ex.Message);
            }
        }

        private void OpenDashboard()
        {
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch { }
        }

        private void OpenAppFolder()
        {
            try
            {
                Process.Start("explorer.exe", "\"" + appDir + "\"");
            }
            catch { }
        }

        private void KillProcesses()
        {
            KillProcessTree(backendProcess);
            KillProcessTree(frontendProcess);
            backendProcess = null;
            frontendProcess = null;
        }

        private void KillProcessTree(Process proc)
        {
            if (proc == null) return;
            try
            {
                if (!proc.HasExited)
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "taskkill",
                        Arguments = "/F /T /PID " + proc.Id,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process p = Process.Start(psi);
                    if (p != null)
                    {
                        p.WaitForExit(3000);
                    }
                }
            }
            catch { }
        }

        private void RestartServices()
        {
            KillProcesses();
            Thread.Sleep(1000);
            StartServices();
            trayIcon.ShowBalloonTip(3000, "Cachette", "Services restarted successfully.", ToolTipIcon.Info);
        }

        private void Log(string msg)
        {
            try
            {
                File.AppendAllText(Path.Combine(appDir, "cachette_launcher.log"), DateTime.Now.ToString("s") + " " + msg + Environment.NewLine);
            }
            catch { }
        }

        private void Exit()
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }

            KillProcesses();
            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                KillProcesses();
            }
            base.Dispose(disposing);
        }
    }
}
