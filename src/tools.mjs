import { z } from 'zod';
import {
  networkStatus,
  recommendedFees,
  addressInfo,
  transactionInfo,
  blockInfo,
  prices,
  estimateTransactionFee,
} from './bitcoin.mjs';
import { verifyMerkleProof } from './merkle.mjs';

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: `Error: ${msg}` }] });

const UTEXO_INFO = {
  name: 'UTEXO Protocol',
  summary:
    'Native USDT & BTC payments: instant, near-zero-fee, private and non-custodial. ' +
    'RGB assets settled on Bitcoin, transported over the Lightning Network, with an ' +
    'EVM bridge secured by an AWS Nitro TEE signer and Bitcoin SPV proofs.',
  buildingBlocks: {
    rgb: 'RGB smart-contract / asset layer anchored to Bitcoin UTXOs.',
    lightning: 'RGB-enabled Lightning node (rgb-lightning-node) for instant asset transfers.',
    bridge: 'Solidity bridge (lock/unlock USDT0) gated by an M-of-N TEE multisig + BtcRelay SPV.',
    enclave: 'AWS Nitro enclave signer with attested PCRs and consignment-bound authorization.',
    wdk: 'Wallet Development Kit modules for building non-custodial multi-chain wallets.',
  },
  repositories: 'https://github.com/UTEXO-Protocol',
  docs: 'https://github.com/UTEXO-Protocol/docs',
};

export function registerTools(server) {
  server.registerTool(
    'utexo_project_info',
    {
      title: 'UTEXO project info',
      description:
        'Return a concise, curated overview of the UTEXO Protocol: what it is, its building ' +
        'blocks (RGB, Lightning, the EVM bridge, the Nitro enclave signer, the WDK) and links.',
      inputSchema: {},
    },
    async () => ok(UTEXO_INFO)
  );

  server.registerTool(
    'bitcoin_network_status',
    {
      title: 'Bitcoin network status',
      description:
        'Current Bitcoin chain tip height, recommended fee rates (sat/vB) and mempool summary, ' +
        'from a public mempool.space-compatible API. No API key required.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await networkStatus());
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'bitcoin_fee_estimates',
    {
      title: 'Bitcoin fee estimates',
      description:
        'Recommended Bitcoin fee rates in sat/vByte for several confirmation targets ' +
        '(fastest, half-hour, hour, economy, minimum).',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await recommendedFees());
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'bitcoin_price',
    {
      title: 'Bitcoin price',
      description:
        'Current Bitcoin spot price in major fiat currencies (USD, EUR, GBP, JPY, CAD, CHF, AUD) ' +
        'from a public mempool.space-compatible price feed.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await prices());
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'estimate_transaction_fee',
    {
      title: 'Estimate a Bitcoin transaction fee',
      description:
        'Estimate the fee for a Bitcoin transaction using live recommended fee rates. Provide the ' +
        'transaction virtual size (vbytes) directly, or an input/output count to approximate the ' +
        'vsize of a native-segwit (P2WPKH) transaction. Returns fee in sats and BTC.',
      inputSchema: {
        vbytes: z.number().positive().optional().describe('Transaction virtual size in vBytes (if known).'),
        inputs: z.number().int().positive().optional().describe('Number of inputs (used to estimate vsize when vbytes is omitted).'),
        outputs: z.number().int().positive().optional().describe('Number of outputs (used to estimate vsize when vbytes is omitted).'),
        priority: z
          .enum(['fastest', 'halfHour', 'hour', 'economy', 'minimum'])
          .optional()
          .describe('Confirmation priority (default: halfHour).'),
      },
    },
    async ({ vbytes, inputs, outputs, priority }) => {
      try {
        return ok(await estimateTransactionFee({ vbytes, inputs, outputs, priority: priority || 'halfHour' }));
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'bitcoin_address',
    {
      title: 'Bitcoin address lookup',
      description:
        'Confirmed + mempool balance (sats and BTC) and transaction counts for a Bitcoin ' +
        'address. Read-only public data.',
      inputSchema: {
        address: z.string().min(10).describe('A Bitcoin address (legacy, P2SH, bech32 or taproot).'),
      },
    },
    async ({ address }) => {
      try {
        return ok(await addressInfo(address));
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'bitcoin_transaction',
    {
      title: 'Bitcoin transaction lookup',
      description:
        'Confirmation status, confirmation count, block height, fee, size/weight and I/O counts ' +
        'for a Bitcoin transaction id.',
      inputSchema: {
        txid: z.string().length(64).describe('The 64-hex-character transaction id.'),
      },
    },
    async ({ txid }) => {
      try {
        return ok(await transactionInfo(txid));
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'bitcoin_block',
    {
      title: 'Bitcoin block lookup',
      description:
        'Block header details (hash, height, time, tx count, merkle root, difficulty, bits) ' +
        'by block height or by block hash. Provide exactly one.',
      inputSchema: {
        height: z.number().int().nonnegative().optional().describe('Block height.'),
        hash: z.string().length(64).optional().describe('Block hash (64 hex chars).'),
      },
    },
    async ({ height, hash }) => {
      try {
        if (height == null && !hash) return fail('provide either height or hash');
        return ok(await blockInfo({ height, hash }));
      } catch (e) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    'verify_merkle_proof',
    {
      title: 'Verify a Bitcoin Merkle proof',
      description:
        'Locally verify a Bitcoin SPV Merkle inclusion proof: given a txid, its position in the ' +
        'block, the sibling path (leaf->root) and the block merkle root, reconstruct the root and ' +
        'check inclusion. All hashes in display (big-endian, explorer) order. Includes the ' +
        '"all index bits consumed" hardening so the position is authenticated. Pure/offline.',
      inputSchema: {
        txid: z.string().length(64).describe('Transaction id, display-order hex.'),
        position: z.number().int().nonnegative().describe('Transaction index within the block.'),
        merklePath: z
          .array(z.string().length(64))
          .describe('Sibling hashes from leaf to root, display-order hex. Empty for single-tx blocks.'),
        merkleRoot: z.string().length(64).describe('Block merkle root, display-order hex.'),
      },
    },
    async ({ txid, position, merklePath, merkleRoot }) => {
      try {
        return ok(verifyMerkleProof(txid, position, merklePath, merkleRoot));
      } catch (e) {
        return fail(e.message);
      }
    }
  );
}

export const TOOL_SUMMARIES = [
  ['utexo_project_info', 'Curated overview of the UTEXO Protocol and its components.'],
  ['bitcoin_network_status', 'Chain tip height, fee rates and mempool summary.'],
  ['bitcoin_fee_estimates', 'Recommended sat/vByte fee rates by confirmation target.'],
  ['bitcoin_price', 'Current BTC spot price in major fiat currencies.'],
  ['estimate_transaction_fee', 'Estimate a tx fee from vsize (or input/output counts) at live rates.'],
  ['bitcoin_address', 'Balance and tx counts for a Bitcoin address.'],
  ['bitcoin_transaction', 'Status, confirmations, fee and size for a txid.'],
  ['bitcoin_block', 'Header details by block height or hash.'],
  ['verify_merkle_proof', 'Offline Bitcoin SPV Merkle inclusion-proof verification.'],
];
