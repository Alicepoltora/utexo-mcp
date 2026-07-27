// Bitcoin Merkle inclusion-proof verification (pure, no network).
//
// Mirrors the algorithm used in Bitcoin SPV clients, including the
// "all index bits must be consumed" hardening (Bitcoin Core's
// CPartialMerkleTree invariant) — without it, positions that differ only
// in bits above the tree depth reconstruct the same root and validate
// interchangeably, leaving the position unauthenticated.
//
// Hashes are accepted in *display* (big-endian) order — the way block
// explorers show txids and merkle roots — and reversed to internal order
// for hashing, matching double-SHA256 semantics.

import { createHash } from 'node:crypto';

function sha256(buf) {
  return createHash('sha256').update(buf).digest();
}
function sha256d(buf) {
  return sha256(sha256(buf));
}

function hexToBytesReversed(hex, label) {
  const clean = String(hex).trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32-byte hex (64 hex chars), got: ${hex}`);
  }
  const b = Buffer.from(clean, 'hex');
  return Buffer.from(b).reverse(); // display -> internal
}

function bytesToDisplayHex(buf) {
  return Buffer.from(buf).reverse().toString('hex');
}

/**
 * Verify that `txid` is included in a block with the given `merkleRoot`.
 * @param {string} txid            display-order hex (explorer format)
 * @param {number} position        transaction index within the block
 * @param {string[]} merklePath    sibling hashes, leaf->root, display-order hex
 * @param {string} merkleRoot      display-order hex
 * @returns {{included:boolean, computedRoot:string, expectedRoot:string, reason?:string}}
 */
export function verifyMerkleProof(txid, position, merklePath, merkleRoot) {
  if (!Number.isInteger(position) || position < 0) {
    throw new Error('position must be a non-negative integer');
  }
  if (!Array.isArray(merklePath)) {
    throw new Error('merklePath must be an array of 32-byte hex strings');
  }

  let current = hexToBytesReversed(txid, 'txid');
  const expected = hexToBytesReversed(merkleRoot, 'merkleRoot');
  let idx = position;

  for (let i = 0; i < merklePath.length; i++) {
    const sibling = hexToBytesReversed(merklePath[i], `merklePath[${i}]`);
    const buf = Buffer.alloc(64);
    if ((idx & 1) === 0) {
      current.copy(buf, 0);
      sibling.copy(buf, 32);
    } else {
      sibling.copy(buf, 0);
      current.copy(buf, 32);
    }
    current = sha256d(buf);
    idx = Math.floor(idx / 2);
  }

  // Hardening: every bit of `position` must have been consumed by a path
  // level. A non-zero residue means the index cannot exist in a tree of
  // this depth — reject so `position` is authenticated by the proof.
  if (idx !== 0) {
    return {
      included: false,
      computedRoot: bytesToDisplayHex(current),
      expectedRoot: merkleRoot.toLowerCase().replace(/^0x/, ''),
      reason: `position ${position} has more significant bits than the ${merklePath.length}-level path can address (index not fully consumed)`,
    };
  }

  const computedRoot = bytesToDisplayHex(current);
  const included = Buffer.compare(current, expected) === 0;
  return {
    included,
    computedRoot,
    expectedRoot: merkleRoot.toLowerCase().replace(/^0x/, ''),
    reason: included ? undefined : 'reconstructed root does not match the committed merkle root',
  };
}
