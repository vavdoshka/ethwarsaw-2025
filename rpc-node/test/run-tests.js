#!/usr/bin/env node

/**
 * Test runner for signature verification tests
 * Usage: node test/run-tests.js
 */

// Ensure server.js doesn't auto-start when running tests
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { runTests } = require('./test-helpers');

// Import all test files (this registers the tests)
require('./signature-verification.test.js');
require('./rpc-server-signature.test.js');

// Run all tests after a short delay to ensure all tests are registered
setTimeout(() => {
  runTests();
}, 100);
