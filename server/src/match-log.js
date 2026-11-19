import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline, Transform } from "node:stream";
import { promisify } from "node:util";

const pipelineAsync = promisify(pipeline);

export class MatchLog {
  constructor(dir) {
    this.dir = dir;
    this.stream = null;
  }

  async open(roomId) {
    await mkdir(this.dir, { recursive: true });
    this.roomId = roomId;
    this.file = path.join(this.dir, `${roomId}-${Date.now()}.ndjson`);
    this.stream = createWriteStream(this.file, { encoding: "utf8", flags: "a" });
    this.transform = new Transform({
      transform(chunk, _encoding, done) {
        done(null, `${chunk.toString()}\n`);
      },
    });
    void pipelineAsync(this.transform, this.stream).catch((error) =>
      console.error("Match log pipeline failed:", error.message),
    );
  }

  append(event) {
    if (!this.transform) return;
    this.transform.write(JSON.stringify(event));
  }

  async close() {
    if (!this.transform) return;
    await new Promise((resolve) => {
      this.stream.once("finish", resolve);
      this.transform.end();
    });
  }

  async replay(response) {
    if (!this.file) {
      response.statusCode = 404;
      response.end("No match log");
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/x-ndjson");
    response.setHeader("Content-Disposition", `attachment; filename="${path.basename(this.file)}"`);
    await pipelineAsync(createReadStream(this.file), response);
  }
}
