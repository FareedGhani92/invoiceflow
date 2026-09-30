import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline";

const scrypt = promisify(scryptCallback);
function readPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => readline.question("Choose a password (14+ characters): ", (answer) => { readline.close(); resolve(answer); }));
  }
  return new Promise((resolve) => {
    process.stdout.write("Choose a password (14+ characters): ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") process.exit(130);
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

const password = await readPassword();
if (typeof password !== "string" || password.length < 14 || password.length > 1024)
  throw new Error("Use a password between 14 and 1024 characters.");
const salt = randomBytes(32);
const digest = await scrypt(password, salt, 64);
process.stdout.write(`scrypt$${salt.toString("hex")}$${digest.toString("hex")}\n`);
