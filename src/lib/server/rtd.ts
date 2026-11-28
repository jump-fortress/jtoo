import { sleep } from '$lib/util';
import { JfRtdWebSocket } from '$lib/websockets/jf-rtd/jf-rtd.svelte';

// the game server connection RTD effects go out on: one per server process, shared by the
// connection check (/api/rtd) and the effects (/api/rtd/[effect])

const jfRtdWs = new JfRtdWebSocket();
const effectQueue: { effect: string; targets: string[] }[] = [];
const secondsBetweenEffects = 1;
let processingQueue = false;
let connectedToken: string | undefined;

/** Connects to the game server with this token if it isn't already. False if the token's refused. */
export async function connectGameServer(token: string): Promise<boolean> {
	// a new token (e.g. a corrected one) needs a new connection, even if the old one is still open
	const tokenChanged = token !== connectedToken;
	if (!tokenChanged && jfRtdWs.wsState === WebSocket.OPEN) return true;

	if (tokenChanged || jfRtdWs.wsState !== WebSocket.CONNECTING) {
		connectedToken = token;
		jfRtdWs.connect(token);
	}

	return new Promise<boolean>((res) => {
		jfRtdWs.addEventListener('open', () => res(true));
		jfRtdWs.addEventListener('error', () => res(false));
		jfRtdWs.addEventListener('close', () => res(false));
	});
}

/**
 * Sends the effect to the servers with these tags (every server without any), once the ones
 * before it are out, a few seconds apart.
 */
export function queueRtdEffect(effect: string, targets: string[] = []) {
	effectQueue.push({ effect, targets });
	processQueue();
}

async function processQueue() {
	if (processingQueue) return;

	processingQueue = true;
	while (effectQueue.length > 0) {
		const { effect, targets } = effectQueue.shift()!;
		jfRtdWs.sendRtdEffect(effect, targets);
		await sleep(secondsBetweenEffects * 1000);
	}

	processingQueue = false;
}
