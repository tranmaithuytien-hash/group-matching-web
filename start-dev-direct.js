const { spawn } = require("child_process");

const child = spawn(
  process.platform === "win32" ? "cmd.exe" : "npx",
  process.platform === "win32"
    ? ["/c", "npx", "next", "dev", "-p", "3010", "-H", "0.0.0.0"]
    : ["next", "dev", "-p", "3010", "-H", "0.0.0.0"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  }
);

child.on("exit", (code) => {
  process.exit(code || 0);
});
