type ObjectUrlEntry<TMetadata> = {
  url: string
  metadata: TMetadata
}

export function createImageObjectUrlCache<TMetadata>(maxEntries: number) {
  const cache = new Map<string, ObjectUrlEntry<TMetadata>>()

  function get(id: string): ObjectUrlEntry<TMetadata> | undefined {
    const entry = cache.get(id)
    if (!entry) return undefined
    cache.delete(id)
    cache.set(id, entry)
    return entry
  }

  function set(id: string, url: string, metadata: TMetadata): ObjectUrlEntry<TMetadata> {
    const previous = cache.get(id)
    if (previous && previous.url !== url) URL.revokeObjectURL(previous.url)

    const entry = { url, metadata }
    cache.delete(id)
    cache.set(id, entry)

    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value
      if (oldestKey == null) break
      const oldest = cache.get(oldestKey)
      if (oldest) URL.revokeObjectURL(oldest.url)
      cache.delete(oldestKey)
    }

    return entry
  }

  function deleteEntry(id: string) {
    const entry = cache.get(id)
    if (entry) URL.revokeObjectURL(entry.url)
    cache.delete(id)
  }

  function clear() {
    for (const entry of cache.values()) URL.revokeObjectURL(entry.url)
    cache.clear()
  }

  return { get, set, delete: deleteEntry, clear }
}
