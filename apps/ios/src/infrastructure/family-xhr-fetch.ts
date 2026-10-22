import {fetch as mediaFetch} from 'expo/fetch';
import {fetch as xhrFetch} from 'whatwg-fetch';

// JSON must not pass through the RN Blob/FileReader queue used by buffered
// media. JSON uses text XHR; binary GETs use Expo's separate native session
// and native arrayBuffer, never RN Blob/FileReader or global.fetch.
export const familyXhrFetch: typeof fetch = Object.assign(
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if ((init?.method || 'GET').toUpperCase() === 'GET' && headers.get('accept') === '*/*') {
      return (mediaFetch as typeof fetch)(input, init);
    }
    if (typeof input !== 'string' || headers.get('accept') !== 'application/json') {
      return xhrFetch(input, init);
    }
    return new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const signal = init?.signal;
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const fail = () => { cleanup(); reject(new TypeError('Family JSON network request failed.')); };
      const abort = () => {
        xhr.abort(); cleanup();
        const error = new Error('Family JSON request aborted.'); error.name = 'AbortError'; reject(error);
      };
      if (signal?.aborted) { abort(); return; }
      xhr.onload = () => {
        cleanup();
        if (!xhr.status) { fail(); return; }
        try {
          const responseHeaders = new Headers();
          xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
            const separator = line.indexOf(':');
            if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
          });
          const body = [204, 205, 304].includes(xhr.status) ? null : xhr.responseText;
          resolve(new Response(body, {status: xhr.status, statusText: xhr.statusText || '', headers: responseHeaders}));
        } catch (error) { reject(error); }
      };
      xhr.onerror = fail; xhr.ontimeout = fail;
      xhr.onabort = () => { cleanup(); const error = new Error('Family JSON request aborted.'); error.name = 'AbortError'; reject(error); };
      try {
        xhr.open(init?.method || 'GET', input, true);
        xhr.responseType = 'text';
        xhr.withCredentials = init?.credentials === 'include';
        headers.forEach((value, name) => xhr.setRequestHeader(name, value));
        signal?.addEventListener('abort', abort);
        xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null);
      } catch (error) { cleanup(); reject(error); }
    });
  }, {polyfill: true},
);
