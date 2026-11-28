import { connectGameServer, queueRtdEffect } from '$lib/server/rtd';
import { rtdEffects } from '$lib/websockets/jf-rtd/jf-rtd.svelte';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url }) => {
	const token = url.searchParams.get('token');
	if (!token) {
		return new Response(`token is not included`, { status: 401 });
	}

	const effect = params.effect!;
	if (!rtdEffects.includes(effect)) {
		return new Response(`'${effect}' is not an rtd effect`, { status: 400 });
	}

	// the servers' tags (eg: AU-SYD1), comma separated. none: every server
	const targets = (url.searchParams.get('targets') ?? '').split(',').filter(Boolean);
	if (targets.some((t) => !/^[A-Za-z0-9_-]+$/.test(t))) {
		return new Response(`invalid server tag in '${targets.join(',')}'`, { status: 400 });
	}

	if (!(await connectGameServer(token))) {
		return new Response('invalid token', { status: 401 });
	}

	queueRtdEffect(effect, targets);
	return new Response(null, { status: 204 });
};
