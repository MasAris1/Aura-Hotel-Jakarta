const adminFetchRetryDelays = [0, 180, 420] as const;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchAdmin(input: RequestInfo | URL, init: RequestInit = {}) {
  let lastResponse: Response | null = null;

  for (const delay of adminFetchRetryDelays) {
    if (delay > 0) {
      await wait(delay);
    }

    const response = await fetch(input, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: init.headers,
    });

    lastResponse = response;

    if (response.status !== 401) {
      return response;
    }
  }

  return lastResponse!;
}
