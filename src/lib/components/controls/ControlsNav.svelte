<script lang="ts">
	import { getContext } from 'svelte';
	import { slide } from '$lib/motion';
	import Checkbox from './Checkbox.svelte';
	import ConnectionPanel, { feedStates } from './ConnectionPanel.svelte';
	import RangeInput from './RangeInput.svelte';
	import SetFundraisingEvent from './SetFundraisingEvent.svelte';
	import RtdServerPicker from './RtdServerPicker.svelte';
	import { fundraisingState, settings } from '$lib/storage.svelte';
	import { obsConnect, obsStatus } from '$lib/websockets/obs/ws-obs.svelte';
	import { connectGameServer, gameServer } from '$lib/game-server.svelte';
	import type { PoolImportResult } from '$lib/console-pools.svelte';
	import type { ConsoleLive, FeedState } from '$lib/websockets/console/console-live.svelte';
	import type { JFRelayWebSocket } from '$lib/websockets/jf-relay/js-relay.svelte';
	import { playerLabel } from '$lib/util';

	// the controls' sticky top bar: the title, every connection's status, and each connection's
	// settings in a panel under it

	type Props = {
		poolImport: PoolImportResult | 'importing' | undefined;
		importPools: () => void;
		onconnectconsole: () => void;
		onconnectrelay: () => void;
		relayError?: string;
	};

	let { poolImport, importPools, onconnectconsole, onconnectrelay, relayError }: Props = $props();

	const live: ConsoleLive = getContext('consoleLive');
	const jfRelayWs: JFRelayWebSocket = getContext('jfRelayWs');

	// the relay reports a websocket readyState instead
	const relayState = $derived<FeedState>(
		jfRelayWs.wsState === WebSocket.OPEN
			? 'open'
			: jfRelayWs.wsState === WebSocket.CONNECTING
				? 'connecting'
				: 'closed'
	);

	// MARK: status bar
	// each status opens its connection's settings right below the bar, one at a time
	type StatusId = 'obs' | 'console' | 'relay' | 'game server' | 'fundraising';
	let openStatus: StatusId | null = $state(null);

	// 'off' is a connection that isn't set up, which isn't worth a red icon. each state has its
	// own shape as well as colour, so they're told apart without the colour
	type Status = FeedState | 'off';
	const statusIcons: Record<Status, string> = {
		connecting: 'icon-[mdi--loading] motion-safe:animate-spin text-yellow-200',
		open: 'icon-[mdi--check-circle] text-green-300',
		closed: 'icon-[mdi--close-circle] text-red-300',
		off: 'icon-[mdi--circle-outline] text-ctp-overlay1'
	};
	// the console is two things: the live race feed (needs the token) and the startup import of
	// the event's player and map pools (public). its dot shows whichever is worse
	const poolStatus = $derived<Status>(
		poolImport === undefined
			? 'off'
			: poolImport === 'importing'
				? 'connecting'
				: poolImport.errors.length
					? 'closed'
					: 'open'
	);
	const statusRank: Record<Status, number> = { open: 0, off: 1, connecting: 2, closed: 3 };
	const consoleStatus = $derived.by<Status>(() => {
		const feed: Status = settings.current.ksnWebSocketToken ? live.raceState : 'off';
		return statusRank[poolStatus] > statusRank[feed] ? poolStatus : feed;
	});
	// rtd effects go out through the game server
	const rtdError = $derived(
		!settings.current.enableFundraisingRtd
			? undefined
			: !settings.current.jfGameServerToken
				? 'no game server token set'
				: gameServer.error || undefined
	);
	const statuses = $derived<{ id: StatusId; status: Status; detail: string }[]>([
		{
			id: 'obs',
			status: settings.current.obsWsPw ? obsStatus.state : 'off',
			detail: obsStatus.error || (settings.current.obsWsPw ? '' : 'no password set')
		},
		{
			id: 'console',
			status: consoleStatus,
			detail: [
				live.dummy
					? 'showing dummy data'
					: settings.current.ksnWebSocketToken
						? ''
						: 'no token set',
				poolStatus === 'closed' && poolImport && poolImport !== 'importing'
					? `pool import failed: ${poolImport.errors.join(', ')}`
					: poolStatus === 'connecting'
						? 'importing pools'
						: ''
			]
				.filter(Boolean)
				.join('; ')
		},
		{
			id: 'relay',
			status: settings.current.jfRelayWebSocketToken ? relayState : 'off',
			detail: relayError || (settings.current.jfRelayWebSocketToken ? '' : 'no token set')
		},
		{
			id: 'game server',
			status: settings.current.jfGameServerToken ? gameServer.state : 'off',
			detail: gameServer.error || (settings.current.jfGameServerToken ? '' : 'no token set')
		},
		// not a connection of its own: set up once there's an event, and broken when RTD is on but
		// can't reach the game server
		{
			id: 'fundraising',
			status: !fundraisingState.current.eventUrl ? 'off' : rtdError ? 'closed' : 'open',
			detail: !fundraisingState.current.eventUrl
				? 'no event set'
				: rtdError
					? `RTD: ${rtdError}`
					: ''
		}
	]);
	const statusText: Record<Status, string> = {
		...Object.fromEntries(Object.entries(feedStates).map(([k, v]) => [k, v.state])),
		off: 'not set up'
	} as Record<Status, string>;
</script>

<!-- every connection at a glance, and a click away from its settings -->
<nav
	class="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 -mt-4 flex w-[calc(100%+2rem)] flex-col items-center self-center bg-obs-background px-4 py-1"
	aria-label="connections"
>
	<!-- title, statuses centred, links: the side columns share the spare width so the statuses
	     stay centred on the page -->
	<div class="font-semibold tracking-wider whitespace-nowrap">JTOO CONTROLS</div>
	<a
		class="absolute top-0 right-0 m-1 opacity-50 hover:opacity-100"
		href="https://github.com/jump-fortress/jtoo"
		target="_blank"
		aria-label="jtoo on GitHub"
	>
		<span class="icon-[mdi--github] block size-7 text-white"></span>
	</a>
	<div class="flex flex-wrap justify-center gap-x-4 gap-y-1">
		{#each statuses as s (s.id)}
			<button
				class="flex items-center gap-1.5 hover:opacity-100
						{openStatus === s.id ? 'underline decoration-ctp-lavender' : 'opacity-80'}"
				title="{s.id}: {statusText[s.status]}{s.detail ? ` (${s.detail})` : ''}"
				aria-expanded={openStatus === s.id}
				aria-controls="status-panel"
				onclick={() => (openStatus = openStatus === s.id ? null : s.id)}
			>
				<span class="text-sm {statusIcons[s.status]}" aria-hidden="true"></span>
				<span>{s.id}</span>
				<span class="sr-only">{statusText[s.status]}</span>
				<!-- the same arrows as the accordions, so it reads as something that opens -->
				<span
					class="-ml-1 {openStatus === s.id
						? 'icon-[mdi--chevron-down]'
						: 'icon-[mdi--chevron-right]'}"
					aria-hidden="true"
				></span>
			</button>
		{/each}
	</div>
	{#if openStatus}
		<!-- capped so a tall panel can't push the whole page out from under the bar -->
		<div
			id="status-panel"
			class="mt-1 flex max-h-[60vh] w-full max-w-lg flex-col gap-1 overflow-y-auto border-t-2 border-obs-padding pt-2 pb-1"
			transition:slide
		>
			{#if openStatus === 'obs'}
				<ConnectionPanel
					label="password"
					id="input-websocket-obs-pw"
					bind:value={settings.current.obsWsPw}
					onconnect={() => {
						if (settings.current.obsWsPw) {
							obsConnect(
								settings.current.obsWsIp,
								settings.current.obsWsPort,
								settings.current.obsWsPw
							);
						}
					}}
					state={obsStatus.state}
					error={obsStatus.error}
				>
					{#snippet advanced()}
						<div class="grid grid-cols-[max-content_1fr] items-center gap-x-2 gap-y-1">
							<label for="input-websocket-obs">ip:</label>
							<input
								type="text"
								class="input"
								id="input-websocket-obs"
								placeholder="localhost"
								bind:value={settings.current.obsWsIp}
							/>
							<label for="input-websocket-obs-port">port:</label>
							<input
								type="number"
								class="remove-arrow input"
								id="input-websocket-obs-port"
								placeholder="4455"
								bind:value={settings.current.obsWsPort}
							/>
						</div>
					{/snippet}
				</ConnectionPanel>
			{:else if openStatus === 'console'}
				<ConnectionPanel
					label="token"
					id="input-websocket"
					bind:value={settings.current.ksnWebSocketToken}
					onconnect={onconnectconsole}
					state={live.raceState}
					note={live.dummy ? 'showing dummy data' : undefined}
				>
					<!-- the pool import shares the console's dot, so its errors show here too -->
					{#if poolImport && poolImport !== 'importing'}
						{#each poolImport.errors as err, i (i)}
							<span class="text-red-300">pool import failed: {err}</span>
						{/each}
					{/if}
					{#snippet advanced()}
						<div class="flex justify-between gap-2">
							{#if poolImport === 'importing'}
								<span class="text-yellow-200">importing console pools...</span>
							{:else if poolImport}
								<span class={poolImport.errors.length ? 'text-red-300' : 'opacity-60'}>
									imported {poolImport.players} players and {poolImport.maps} maps
								</span>
							{:else}
								<span></span>
							{/if}
							<button
								class="button-link"
								title="import the event's players and maps from the console pools again"
								disabled={poolImport === 'importing'}
								onclick={importPools}>re-import</button
							>
						</div>
						<div class="grid grid-cols-[max-content_1fr] items-center gap-x-2">
							<label for="input-console-url">console url:</label>
							<input
								type="text"
								class="input"
								id="input-console-url"
								placeholder="https://console.jumpfortress.tf"
								value={settings.current.consoleBaseUrl}
								onchange={(e) => {
									let target = e.target as HTMLInputElement;
									settings.current.consoleBaseUrl = target.value.trim();
								}}
							/>
						</div>
						<!-- the in-game spectator shows timer events a little after the console sends them -->
						<RangeInput
							setting="timerDelayMs"
							label="timer delay"
							max={500}
							step={10}
							unit=" ms"
							editable
							help="the overlay's timers wait this long, to match the observer"
						/>
						<div class="flex flex-col gap-1">
							<Checkbox setting="useDummyData" desc="use dummy race and tournament data" />
							<Checkbox setting="logWsMessages" desc="log websocket messages" />
						</div>
					{/snippet}
				</ConnectionPanel>
			{:else if openStatus === 'relay'}
				<ConnectionPanel
					label="token"
					id="input-websocket-jf"
					bind:value={settings.current.jfRelayWebSocketToken}
					onconnect={onconnectrelay}
					state={relayState}
					error={relayError}
				>
					<!-- the last players the relay was asked to spectate, to tell whether a pick reached it -->
					{#if jfRelayWs.lastSelect}
						{@const last = jfRelayWs.lastSelect}
						<span class={last.sent ? 'opacity-60' : 'text-red-300'}>
							last spectate: {last.players.map((p) => (p ? playerLabel(p) : 'none')).join(' vs ')}
							at {new Date(last.at).toLocaleTimeString()}{last.sent
								? ''
								: ' (not sent: relay not connected)'}
						</span>
					{/if}
					{#snippet advanced()}
						<!-- the relay tells the game to spectate the picked players, which takes a moment -->
						<RangeInput
							setting="playerSwitchDelayMs"
							label="switch delay"
							max={500}
							step={10}
							unit=" ms"
							editable
							help="the overlay switches players this long after a pick, to match the observer"
						/>
					{/snippet}
				</ConnectionPanel>
			{:else if openStatus === 'game server'}
				<!-- rtd effects are sent to the game server -->
				<ConnectionPanel
					label="token"
					id="input-game-server-token"
					bind:value={settings.current.jfGameServerToken}
					onconnect={connectGameServer}
					state={gameServer.state}
					error={gameServer.error || undefined}
				>
					<!-- also under fundraising and in the page's automation section -->
					<Checkbox desc="enable fundraising RTD" setting="enableFundraisingRtd" />
					<RtdServerPicker />
				</ConnectionPanel>
			{:else if openStatus === 'fundraising'}
				<SetFundraisingEvent>
					<!-- also in the page's automation section -->
					<Checkbox desc="enable fundraising RTD" setting="enableFundraisingRtd" />
					{#if rtdError}
						<div class="text-red-300">{rtdError}</div>
					{/if}
				</SetFundraisingEvent>
			{/if}
		</div>
	{/if}
</nav>
