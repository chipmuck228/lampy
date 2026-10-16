import {fetch as xhrFetch} from 'whatwg-fetch';

// Import the implementation itself: RN's Network/fetch exports global.fetch,
// which Expo or another runtime wrapper may already have replaced.
export const familyXhrFetch: typeof fetch = xhrFetch;
