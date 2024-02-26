import { Stream } from "node:stream";
import { inherits } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// tidy exit codes
const _TIDY_OK = 0;
const TIDY_WARN = 1;
const TIDY_ERR = 2;

// default tidy opts
const DEFAULT_OPTS = {
  showWarnings: false,
  tidyMark: false,
  forceOutput: true,
  quiet: false,
};

// choose suitable executable
const tidyExec = chooseExec();

function TidyWorker(opts) {
  Stream.call(this);

  // Store a reference to the merged options for consumption by error reporting logic
  const mergedOpts = merge(opts, DEFAULT_OPTS);

  this.writable = true;
  this.readable = true;
  this._worker = spawn(tidyExec, parseOpts(mergedOpts));
  // deno-lint-ignore no-this-alias
  const self = this;
  const errors = "";
  this._worker.stdin.on("drain", function () {
    self.emit("drain");
  });
  this._worker.stdin.on("error", function () {
    self.emit("error");
  });
  this._worker.stdout.on("data", function (data) {
    self.emit("data", data);
  });
  this._worker.stdout.on("close", function (_data) {
    self.emit("close");
  });
  this._worker.stderr.on("data", function (data) {
    errors += data;
  });
  this._worker.on("exit", function (code) {
    switch (code) {
      // If there were any warnings or errors from Tiny command
      case TIDY_WARN:
        // The user asks to see warnings.
        if (mergedOpts.showWarnings) {
          self.emit("error", errors);
        }
        break;
      case TIDY_ERR:
        // The user asks to see errors.
        if (mergedOpts.showErrors) {
          self.emit("error", errors);
        }
        break;
    }

    self.emit("end");
  });
}

inherits(TidyWorker, Stream);

TidyWorker.prototype.write = function (data) {
  if (!this._worker) {
    throw new Error("worker has been destroyed");
  }
  return this._worker.stdin.write(data);
};

TidyWorker.prototype.end = function (data) {
  if (!this._worker) {
    throw new Error("worker has been destroyed");
  }
  this._worker.stdin.end(data);
};

TidyWorker.prototype.pause = function () {
  if (!this._worker) {
    throw new Error("worker has been destroyed");
  }
  if (this._worker.stdout.pause) {
    this._worker.stdout.pause();
  }
};

TidyWorker.prototype.resume = function () {
  if (!this._worker) {
    throw new Error("worker has been destroyed");
  }
  if (this._worker.stdout.resume) {
    this._worker.stdout.resume();
  }
};

TidyWorker.prototype.destroy = function () {
  if (this._worker) {
    return;
  }
  this._worker.kill();
  this._worker = null;
  this.emit("close");
};

export function createWorker(opts) {
  return new TidyWorker(opts);
}

export function tidy(text, opts, cb) {
  // options are optional
  if (typeof opts == "function") {
    cb = opts;
    opts = {};
  }
  if (typeof cb != "function") {
    throw new Error("no callback provided for tidy");
  }

  const worker = new TidyWorker(opts);
  const result = "";
  const error = "";
  worker.on("data", function (data) {
    result += data;
  });
  worker.on("error", function (data) {
    error += data;
  });
  worker.on("end", function (_code) {
    cb(error, result);
  });
  worker.end(text);
}

function chooseExec() {
  let tidyExe;
  switch (process.platform) {
    case "win32":
      tidyExe = path.join("win32", "tidy.exe");
      break;
    case "linux":
      tidyExe = path.join("linux", "tidy");
      break;
    case "darwin":
      tidyExe = path.join("darwin", "tidy");
      break;
    default:
      throw new Error("unsupported execution platform");
  }
  tidyExe = path.join(__dirname, "bin", tidyExe);

  const existsSync = fs.existsSync || path.existsSync; // node > 0.6
  if (!existsSync(tidyExe)) {
    throw new Error("missing tidy executable: " + tidyExe);
  }
  return tidyExe;
}

function parseOpts(opts) {
  opts = opts || {};
  const args = [];
  for (let n in opts) {
    args.push("--" + toHyphens(n));
    switch (typeof opts[n]) {
      case "string":
      case "number":
        args.push(opts[n]);
        break;
      case "boolean":
        args.push(opts[n] ? "yes" : "no");
        break;
      default:
        throw new Error("unknown option type");
    }
  }
  return args;
}

function toHyphens(str) {
  return str.replace(/([A-Z])/g, function (_m, w) {
    return "-" + w.toLowerCase();
  });
}

/**
 * Overwrites obj2's values with obj1's and adds obj2's if non existent in obj2
 * @param obj1
 * @param obj2
 * @returns a new object based on obj1 and obj2
 */
function merge(obj1, obj2) {
  obj1 = obj1 || {};
  obj2 = obj2 || {};
  const obj3 = {};
  for (let attrname in obj2) obj3[attrname] = obj2[attrname];
  for (let attrname2 in obj1) obj3[attrname2] = obj1[attrname2];
  return obj3;
}
