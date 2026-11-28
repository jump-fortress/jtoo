import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';

/**
 * The upstream DWB url for a participant, plus an optional sub path. The id comes from the
 * request, so it's limited to a plain slug: anything else (eg: `..`) could reach other paths
 * on the DWB api.
 */
export function dwbParticipantUrl(id: string, subPath = ''): string {
	if (!/^[\w-]+$/.test(id)) error(400, 'invalid participant id');
	return `${env.DWB_API_URL}/participants/${id}${subPath}`;
}

/**
 * A DWB url made unique to this request, so no cache along the way (eg: cloudflare's, for the
 * worker's own requests) can answer it with a stored copy: DWB marks its responses cacheable
 * for 4 hours, and ignores the extra parameter. Appended as text, not through URLSearchParams,
 * which would re-encode the query's spaces as + (DWB wants %20).
 */
export function fresh(url: string): string {
	return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

/**
 * A DWB response passed on to the overlay, uncached. DWB marks its responses cacheable for 4
 * hours, which kept browsers (OBS's included) showing old donations; only what the client reads
 * (the body, its type, the status and the ETag) is passed on.
 */
export function uncached(resp: Response): Response {
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	for (const name of ['Content-Type', 'ETag']) {
		const value = resp.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(resp.body, { status: resp.status, headers });
}

export async function fetchDwbApi({
	subPath,
	requestEvent
}: {
	subPath?: string;
	requestEvent: RequestEvent;
}) {
	const { params, url, fetch } = requestEvent;
	const headers = new Headers();
	const eTag = requestEvent.request.headers.get('If-None-Match');
	if (eTag) {
		headers.set('If-None-Match', eTag);
	}

	return await fetch(
		`${dwbParticipantUrl(params.id ?? '', subPath)}?${url.searchParams.toString().replaceAll('+', '%20')}`,
		{
			headers
		}
	);
}
