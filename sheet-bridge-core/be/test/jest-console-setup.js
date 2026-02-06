/**
 * Jest console setup to suppress stack traces for console.log
 */

// Store original console methods
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

// Override console methods to filter out Jest stack traces
const createConsoleWrapper = (originalMethod) => {
  return (...args) => {
    // Filter out stack trace lines that Jest adds
    const filteredArgs = args.filter(arg => {
      if (typeof arg === 'string') {
        // Filter out Jest stack trace patterns
        return !arg.includes('at Object.<anonymous>') &&
               !arg.includes('at getTestWallets') &&
               !arg.match(/at \w+ \(.*test\/.*\.ts:\d+:\d+\)/);
      }
      return true;
    });
    
    if (filteredArgs.length > 0) {
      originalMethod(...filteredArgs);
    }
  };
};

// Apply wrappers
console.log = createConsoleWrapper(originalLog);
console.info = createConsoleWrapper(originalInfo);
console.warn = createConsoleWrapper(originalWarn);
// Keep error stack traces for debugging
console.error = originalError;
