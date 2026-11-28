import { dwbParticipantUrl, fetchDwbApi, uncached } from '$lib/server/dwb';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (requestEvent) => {
	return uncached(
		await fetchDwbApi({
			requestEvent
		})
	);
};
