import { settings } from '$lib/storage.svelte';
import type { FeedState } from '$lib/websockets/console/console-live.svelte';

// the game server connection RTD effects go out on. it's held by the sveltekit server, not the
// page, so its status here is what the last request to it found

export const gameServer = $state<{ state: FeedState; error: string }>({
	state: 'closed',
	error: ''
});

/** Updates the status from a response from /api/rtd. */
export async function updateGameServerStatus(resp: Response) {
	if (resp.status === 401) {
		gameServer.state = 'closed';
		gameServer.error = (await resp.text()) || 'invalid token';
	} else if (resp.ok) {
		gameServer.state = 'open';
		gameServer.error = '';
	}
}

/** Connects the sveltekit server to the game server with the saved token. */
export async function connectGameServer() {
	const token = settings.current.jfGameServerToken.trim();
	if (!token) {
		gameServer.state = 'closed';
		gameServer.error = '';
		return;
	}

	gameServer.state = 'connecting';
	try {
		const resp = await fetch(`/api/rtd?token=${encodeURIComponent(token)}`);
		await updateGameServerStatus(resp);
	} catch (e) {
		gameServer.state = 'closed';
		gameServer.error = `couldn't reach the server: ${e}`;
	}
}

type GameServerInfo = { tag: string; name: string };

// the event's game servers, which RTD effects can be sent to. the console reads the same list
export const rtdServers = $state<{ list: GameServerInfo[]; error: string; loading: boolean }>({
	list: [],
	error: '',
	loading: false
});

/** Fetches the list of game servers. */
export async function loadRtdServers() {
	rtdServers.loading = true;
	try {
		const resp = await fetch('https://static.jumpfortress.tf/cfg/servers.json', {
			cache: 'no-store'
		});
		if (!resp.ok) throw new Error(`${resp.status}`);
		const { servers } = (await resp.json()) as { servers?: GameServerInfo[] };
		if (!servers?.length) throw new Error('no servers listed');
		rtdServers.list = servers.map(({ tag, name }) => ({ tag, name }));
		rtdServers.error = '';
	} catch (e) {
		rtdServers.error = `couldn't fetch the server list: ${e}`;
	} finally {
		rtdServers.loading = false;
	}
}

/** The game server token, for the RTD requests. */
export function gameServerToken(): string {
	return encodeURIComponent(settings.current.jfGameServerToken.trim());
}
