import { ProxyWebSocket } from '$lib/ProxyWebSocket';

export const rtdEffects = [
	'frozen',
	'funnyfeeling',
	'fasthands',
	'smite',
	'lag',
	'stronggravity',
	'lowgravity',
	'tinymann',
	'snail',
	'earthquake',
	'infinitejump',
	'noclip',
	'increasedspeed',
	'frog',
	'cursed',
	'drunkwalk'
];

export class JfRtdWebSocket {
	private _ws: ProxyWebSocket | undefined;
	private _wsState: number;

	constructor() {
		this._wsState = $state(WebSocket.CLOSED);
	}

	connect(wsToken: string) {
		if (
			this._ws &&
			(this._ws.readyState === ProxyWebSocket.OPEN ||
				this._ws.readyState === ProxyWebSocket.CONNECTING)
		) {
			console.log('closing web socket connection...');
			this._ws.close();
		}

		const ws = new ProxyWebSocket(`wss://console.jumpfortress.tf/?token=${wsToken}`);
		this._ws = ws;

		this._ws.onclose = () => {
			console.log('jf rtd websocket closing');
		};

		this._ws.onerror = (ev) => {
			console.log(ev);
		};

		this._ws.state?.subscribe((state) => {
			// a replaced socket closing late mustn't mark the new one closed
			if (this._ws === ws) this._wsState = state;
		});
	}

	addEventListener(
		type: keyof WebSocketEventMap,
		listener: (this: WebSocket, ev: Event | CloseEvent | MessageEvent<any>) => any,
		options?: boolean | AddEventListenerOptions
	) {
		this._ws?.addEventListener(type, listener, options);
	}

	/**
	 * Sends the effect to the given servers' tags, or every server without any. The console relays
	 * both kinds to every server: each server's plugin skips targeted commands not meant for it.
	 */
	sendRtdEffect(effect: string, targets: string[] = []) {
		const msgString = JSON.stringify({
			timestamp: Math.floor(Date.now() / 1000),
			command: 'sm_rtd ' + effect,
			server_code: 'admin', // the sender, not a target
			...(targets.length > 0
				? { type: 'rcon_targeted', target: targets }
				: { type: 'rcon_broadcast' })
		});

		if (this._ws && this._wsState === WebSocket.OPEN) {
			this._ws.send(msgString);
		} else {
			console.warn('socket not open, dropping', msgString);
		}
	}

	get wsState(): number {
		return this._wsState;
	}
}
