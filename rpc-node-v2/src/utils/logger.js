function createLogger() {
  function emit(level, ...args) {
    const ts = new Date().toISOString();
    if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
      console.log(JSON.stringify({ ts, level, ...args[0] }));
      return;
    }
    console.log(JSON.stringify({
      ts,
      level,
      message: args.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")
    }));
  }

  return {
    info: (...args) => emit("info", ...args),
    warn: (...args) => emit("warn", ...args),
    error: (...args) => emit("error", ...args),
    debug: (...args) => emit("debug", ...args)
  };
}

module.exports = { createLogger };
