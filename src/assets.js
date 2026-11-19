export class AssetError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message, { cause });
    this.name = "AssetError";
    this.status = status;
  }
}

export async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok)
    throw new AssetError(`HTTP ${response.status} for ${url}`, { status: response.status });
  try {
    return await response.json();
  } catch (error) {
    throw new AssetError(`Invalid JSON in ${url}`, { cause: error });
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function retry(operation, { signal, attempts = 3, baseDelay = 180 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.name === "AbortError") throw error;
      if (error instanceof AssetError && error.status >= 400 && error.status < 500) throw error;
      if (attempt === attempts - 1) break;
      const jitter = Math.random() * 80;
      await delay(baseDelay * 2 ** attempt + jitter, signal);
    }
  }
  throw lastError;
}

export async function loadImage(url, signal) {
  return retry(
    async () => {
      const response = await fetch(url, { signal });
      if (!response.ok)
        throw new AssetError(`HTTP ${response.status} for ${url}`, { status: response.status });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = objectUrl;
      try {
        await image.decode();
        return image;
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
      }
    },
    { signal },
  );
}

export async function loadAudio(url, signal, context) {
  return retry(
    async () => {
      const response = await fetch(url, { signal });
      if (!response.ok)
        throw new AssetError(`HTTP ${response.status} for ${url}`, { status: response.status });
      const bytes = await response.arrayBuffer();
      return context.decodeAudioData(bytes.slice(0));
    },
    { signal },
  );
}

export async function loadAll(tasks, { signal, onProgress } = {}) {
  let completed = 0;
  const promises = tasks.map((task) =>
    task().then((result) => {
      completed++;
      onProgress?.(completed, tasks.length);
      return result;
    }),
  );

  const results = await Promise.all(promises);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return results;
}

export async function loadAllSettled(tasks, { signal, onProgress } = {}) {
  let completed = 0;
  const promises = tasks.map((task) =>
    Promise.resolve()
      .then(task)
      .then(
        (value) => {
          completed++;
          onProgress?.(completed, tasks.length);
          return { status: "fulfilled", value };
        },
        (reason) => {
          completed++;
          onProgress?.(completed, tasks.length);
          return { status: "rejected", reason };
        },
      ),
  );
  const results = await Promise.all(promises);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return results;
}
