const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(prefix, data) {
  return `${prefix}:${JSON.stringify(data)}`;
}

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return item.value;
}

function setCached(key, value, ttl = CACHE_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

function clearCache() {
  cache.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now > item.expiresAt) {
      cache.delete(key);
    }
  }
}, 60000);

module.exports = {
  getCacheKey,
  getCached,
  setCached,
  clearCache
};

