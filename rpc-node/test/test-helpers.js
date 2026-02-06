/**
 * Simple test helpers for Node.js built-in test runner or custom test framework
 * Compatible with Node.js 18+ test runner or can be adapted for Jest/Mocha
 */

// Simple test framework implementation
const tests = [];
let currentDescribe = null;
let passed = 0;
let failed = 0;

function describe(name, fn) {
  const previousDescribe = currentDescribe;
  currentDescribe = name;
  try {
    fn();
  } catch (error) {
    console.error(`Error in describe "${name}":`, error);
  }
  currentDescribe = previousDescribe;
}

function it(name, fn) {
  const testName = currentDescribe ? `${currentDescribe} - ${name}` : name;
  tests.push({ name: testName, fn });
}

// Simple expect implementation
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toContain(substring) {
      if (typeof actual !== 'string' || !actual.includes(substring)) {
        throw new Error(`Expected "${actual}" to contain "${substring}"`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    }
  };
}

// Run all tests
async function runTests() {
  if (tests.length === 0) {
    console.log('⚠️  No tests found. Make sure test files are imported.');
    return;
  }
  
  console.log(`\n🧪 Running ${tests.length} tests...\n`);
  
  for (const test of tests) {
    try {
      const result = test.fn();
      // Handle both sync and async tests
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   ${error.stack.split('\n')[1]}`);
      }
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Export for use
module.exports = {
  describe,
  it,
  expect,
  runTests
};

// Don't auto-run - let run-tests.js handle it
