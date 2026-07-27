// Thin, read-only client for a public Bitcoin (mempool.space-compatible) API.
// No API keys, no secrets — every call hits public endpoints.

const BASE = (process.env.BITCOIN_API_BASE || 'https://mempool.space/api').replace(/\/$/, '');

async function api(path, { timeoutMs = 10000, raw = false } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'utexo-mcp/1.0 (+https://mcp.gogettest.online)' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`upstream ${res.status} for ${path}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    return raw ? await res.text() : await res.json();
  } finally {
    clearTimeout(t);
  }
}

const SATS = 100_000_000;
export function satsToBtc(sats) {
  return (Number(sats) / SATS).toFixed(8);
}

export async function tipHeight() {
  return Number(await api('/blocks/tip/height', { raw: true }));
}

export async function recommendedFees() {
  return api('/v1/fees/recommended');
}

export async function networkStatus() {
  const [height, fees, mempool] = await Promise.all([
    tipHeight(),
    recommendedFees().catch(() => null),
    api('/mempool').catch(() => null),
  ]);
  return {
    tipHeight: height,
    recommendedFeesSatVb: fees,
    mempool: mempool
      ? { txCount: mempool.count, vsize: mempool.vsize, totalFeeSats: mempool.total_fee }
      : null,
    source: BASE,
  };
}

export async function addressInfo(address) {
  const a = await api(`/address/${encodeURIComponent(address)}`);
  const funded = a.chain_stats.funded_txo_sum + a.mempool_stats.funded_txo_sum;
  const spent = a.chain_stats.spent_txo_sum + a.mempool_stats.spent_txo_sum;
  const balanceSats = funded - spent;
  return {
    address: a.address,
    balanceSats,
    balanceBtc: satsToBtc(balanceSats),
    confirmedTxCount: a.chain_stats.tx_count,
    mempoolTxCount: a.mempool_stats.tx_count,
    source: BASE,
  };
}

export async function transactionInfo(txid) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(txid))) {
    throw new Error('txid must be 64 hex chars');
  }
  const [tx, tip] = await Promise.all([api(`/tx/${txid}`), tipHeight()]);
  const confirmed = Boolean(tx.status?.confirmed);
  const confirmations = confirmed ? tip - tx.status.block_height + 1 : 0;
  return {
    txid: tx.txid,
    confirmed,
    confirmations,
    blockHeight: tx.status?.block_height ?? null,
    feeSats: tx.fee,
    weight: tx.weight,
    vsize: Math.ceil(tx.weight / 4),
    sizeBytes: tx.size,
    inputs: tx.vin?.length ?? null,
    outputs: tx.vout?.length ?? null,
    valueOutSats: (tx.vout || []).reduce((s, o) => s + (o.value || 0), 0),
    source: BASE,
  };
}

export async function blockInfo({ height, hash }) {
  let blockHash = hash;
  if (!blockHash && height != null) {
    blockHash = (await api(`/block-height/${Number(height)}`, { raw: true })).trim();
  }
  if (!blockHash) throw new Error('provide either height or hash');
  const b = await api(`/block/${blockHash}`);
  return {
    hash: b.id,
    height: b.height,
    timestamp: b.timestamp,
    timeUtc: new Date(b.timestamp * 1000).toISOString(),
    txCount: b.tx_count,
    sizeBytes: b.size,
    weight: b.weight,
    merkleRoot: b.merkle_root,
    difficulty: b.difficulty,
    nonce: b.nonce,
    bits: b.bits,
    previousBlockHash: b.previousblockhash,
    source: BASE,
  };
}

export const apiBase = BASE;
