const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Journal } = require('../../src/core/journal');
const { makeTempDir } = require('../helpers');

test('journal appends and replays', () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const journal = new Journal(journalPath);
  journal.append({ type: 'tx.accepted', txHash: '0xabc' });

  const replayed = [];
  journal.replay((event) => replayed.push(event));
  assert.equal(replayed.length, 1);
  assert.equal(replayed[0].txHash, '0xabc');
});

test('journal detects duplicate tx hash', () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const journal = new Journal(journalPath);
  journal.append({ type: 'tx.accepted', txHash: '0xabc' });
  assert.throws(() => journal.append({ type: 'tx.accepted', txHash: '0xabc' }), /Duplicate tx hash/);
});

test('journal fails on corrupt line', () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  fs.writeFileSync(journalPath, '{bad-json}\n');
  assert.throws(() => new Journal(journalPath), /Invalid journal JSON/);
});
