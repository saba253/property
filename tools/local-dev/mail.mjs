// LOCAL DEVELOPMENT ONLY: an SMTP catcher on 127.0.0.1:1025. Every message is stored as an
// .eml file in <project>/.data/mail (git-ignored) and is NEVER delivered anywhere. Open the
// files with any mail program or a text editor. Nothing about the messages is printed.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMTPServer } from "smtp-server";

const outbox = path.resolve(import.meta.dirname, "..", "..", ".data", "mail");
mkdirSync(outbox, { recursive: true });
let stored = 0;

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  size: 1024 * 1024,
  onConnect(session, callback) {
    // Only this computer may connect.
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(session.remoteAddress)) {
      return callback(new Error("Local connections only"));
    }
    callback();
  },
  onData(stream, _session, callback) {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      const file = path.join(
        outbox,
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${stored}.eml`,
      );
      writeFileSync(file, Buffer.concat(chunks));
      stored++;
      console.log(`[mail] stored message ${stored} in .data/mail`);
      callback();
    });
  },
});
server.listen(1025, "127.0.0.1", () =>
  console.log(
    "SMTP catcher listening on 127.0.0.1:1025; messages go to .data/mail (never sent). Ctrl+C stops it.",
  ),
);
