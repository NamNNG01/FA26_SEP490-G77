package com.examprep.util;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Lightweight bounded short-TTL in-memory cache for read-heavy endpoints.
 * When ttlMillis <= 0, caching is bypassed completely.
 */
public class ShortTtlCache<K, V> {

    private record Entry<V>(V value, long expiresAtMillis) { }

    private final ConcurrentHashMap<K, Entry<V>> store = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<K, Object> keyLocks = new ConcurrentHashMap<>();
    private final long ttlMillis;
    private final int maxEntries;

    public ShortTtlCache(long ttlMillis, int maxEntries) {
        this.ttlMillis = ttlMillis;
        this.maxEntries = Math.max(16, maxEntries);
    }

    public V getOrCompute(K key, Supplier<V> loader) {
        if (ttlMillis <= 0) {
            return loader.get();
        }
        long now = System.currentTimeMillis();
        Entry<V> cached = store.get(key);
        if (cached != null && cached.expiresAtMillis() > now) {
            return cached.value();
        }
        Object lock = keyLocks.computeIfAbsent(key, k -> new Object());
        synchronized (lock) {
            long innerNow = System.currentTimeMillis();
            Entry<V> rechecked = store.get(key);
            if (rechecked != null && rechecked.expiresAtMillis() > innerNow) {
                return rechecked.value();
            }
            V fresh = loader.get();
            if (store.size() >= maxEntries) {
                store.entrySet().removeIf(e -> e.getValue().expiresAtMillis() <= innerNow);
                if (store.size() >= maxEntries) {
                    store.clear();
                }
            }
            store.put(key, new Entry<>(fresh, innerNow + ttlMillis));
            return fresh;
        }
    }
}
