// `||` rather than `??`: an unset build arg or CI variable inlines as an empty
// string, which is not nullish and would otherwise make every API call
// relative to the web app's own origin.
export const api_url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
