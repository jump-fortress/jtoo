<script lang="ts">
	import Accordion from '$lib/components/controls/Accordion.svelte';
	import AutoToggle from '$lib/components/controls/AutoToggle.svelte';
	import Group from '$lib/components/controls/Group.svelte';
	import Checkbox from '$lib/components/controls/Checkbox.svelte';
	import ConfirmButton from '$lib/components/controls/ConfirmButton.svelte';
	import ControlsNav from '$lib/components/controls/ControlsNav.svelte';
	import ItemInput from '$lib/components/controls/ItemInput.svelte';
	import RangeInput from '$lib/components/controls/RangeInput.svelte';
	import RadioInputs from '$lib/components/controls/RadioInputs.svelte';
	import Importplayer from '$lib/components/controls/ImportPlayer.svelte';
	import ImportMap from '$lib/components/controls/ImportMap.svelte';
	import ManagePlayers from '$lib/components/controls/ManagePlayers.svelte';
	import ManageMaps from '$lib/components/controls/ManageMaps.svelte';
	import EditBracket from '$lib/components/controls/EditBracket.svelte';
	import ManageBrackets from '$lib/components/controls/ManageBrackets.svelte';

	import PlayerControl from '$lib/components/controls/PlayerControl.svelte';
	import { getFiltersStyle } from '$lib/filters.svelte';
	import {
		settings,
		overlay,
		items,
		defaultStages,
		resetVisualSettings,
		hardReset
	} from '$lib/storage.svelte';
	import {
		BrokenOverlayScenes,
		Fonts,
		MonoFonts,
		OverlayScenes,
		IdleOverlayScenes,
		TFClasses
	} from '$lib/types.svelte';
	// import * as _ from 'underscore';

	import { obsConnect, setScene } from '$lib/websockets/obs/ws-obs.svelte';
	import { idleOBSSceneName } from '$lib/obs-browser-source.svelte';
	import {
		DEFAULT_MAP_POOL_ID,
		DEFAULT_PLAYER_POOL_ID,
		importConsolePools,
		poolMaps,
		type PoolImportResult
	} from '$lib/console-pools.svelte';
	import { fetchConsoleTournaments, type ConsoleTournamentList } from '$lib/console-tournaments';

	import { KSNWebSocketController } from '$lib/websockets/ksn/ws-ksn.svelte';
	import { ConsoleLive } from '$lib/websockets/console/console-live.svelte';
	import { getMap, consoleBaseUrl, playerLabel, roundNumber } from '$lib/util';
	import { withLiveResults } from '$lib/round-results';
	import type { TournamentRound } from '$lib/websockets/console/live-types';
	import { mapName } from '$lib/map-picks';
	import { onMount, setContext, untrack } from 'svelte';
	import { JFRelayWebSocket } from '$lib/websockets/jf-relay/js-relay.svelte';
	import { watchRtdDonations } from '$lib/fundraising-rtd';
	import {
		startTestDonations,
		TEST_DONATIONS_ALLOWED,
		testDonations
	} from '$lib/api/dwb/dwb-test-donations.svelte';
	import { connectGameServer } from '$lib/game-server.svelte';
	import { syncBracketResults } from '$lib/bracket-live.svelte';
	import MatchScore from '$lib/components/controls/MatchScore.svelte';

	type Error = { state: boolean; msg: string };
	import { refreshSchedule, schedule, scheduleDays, scheduleSheetUrl } from '$lib/schedule.svelte';

	let ksnWs: KSNWebSocketController | undefined = $state();
	// the console's progress channel: the RTD relay, and the progress that sorts mass-single races'
	// player lists. Created here, not on mount, so the player controls can get it from context
	const jfRelayWs = new JFRelayWebSocket();
	setContext('jfRelayWs', jfRelayWs);

	// tell the relay who player A and B are whenever they change, whether picked here or selected
	// by the overlay when a duel race or picks and bans starts. A new automatic selection is sent
	// even when it's the players already selected, eg: the next game of a series, as someone may
	// have spectated someone else in-game since. Not on load, only on a change
	let relayedPlayers: string | undefined;
	$effect(() => {
		const players = [overlay.current.players[0], overlay.current.players[1]];
		const key = JSON.stringify([players, overlay.current.autoSelectedBy]);
		if (relayedPlayers !== undefined && key !== relayedPlayers) {
			untrack(() => jfRelayWs?.broadcastSelectedPlayers(players));
		}
		relayedPlayers = key;
	});
	// any settings change re-runs whatever reads settings.current, so the effects that switch the
	// OBS scene and connect the relay read these instead: they only change when the value does.
	// read straight from settings, picking an idle scene (a settings change) would switch OBS
	// straight back to the overlay scene
	const overlayScene = $derived(settings.current.overlayScene);
	const rtdEnabled = $derived(settings.current.enableFundraisingRtd);

	// the controls open their own race feed, to show whether the console is reachable and to
	// order the player lists by the race's leaderboard, and follow the overlay's tournament to
	// list its rounds for the leaderboard scene
	const live = new ConsoleLive({ tournament: true });
	setContext('consoleLive', live);
	$effect(() => {
		live.pinTournament(overlay.current.tournament || null);
	});
	// a duel race for a bracket match gives that match's game to its winner when it ends. Run
	// from here, not the overlay, as there's only ever one controls page, while there can be
	// several overlay sources (eg: on the Idle scene), and each would count the game again
	syncBracketResults(live);
	// the rounds the leaderboard scene can show: any not voided, finalized or not. an unfinalized
	// round has its live results while its race is the current one (see withLiveResults)
	let leaderboardRounds = $derived(
		withLiveResults(live.tournament?.rounds ?? [], live.currentRace)
			.filter((r) => !r.voided)
			.sort((a, b) => a.roundIndex - b.roundIndex)
	);
	// a duel tournament has no standings, so the leaderboard scene only shows its rounds, and
	// shows the latest one when the picked view isn't one of them (see LeaderboardScene)
	let isDuelTournament = $derived(live.tournament?.kind === 'duel');
	let leaderboardView = $derived.by(() => {
		const view = overlay.current.leaderboardView ?? 'standings';
		if (!isDuelTournament || leaderboardRounds.some((r) => r.roundIndex === view)) return view;
		return leaderboardRounds.at(-1)?.roundIndex ?? view;
	});
	// a duel round is told apart by its round name (the console's stage), map and matchup, not a
	// number. an unfinalized round with no live results has no matchup, so it's left out
	function duelRoundLabel(round: TournamentRound) {
		const matchup = round.results.map((e) => playerLabel(e.steamId3)).join(' vs ');
		return [round.stage, round.map && mapName(round.map), matchup].filter(Boolean).join(' · ');
	}

	// the console's tournaments, for picking the one the leaderboard scene shows and finding the
	// pools of the one the controls follow
	let tournaments: ConsoleTournamentList | undefined = $state();
	let tournamentsError = $state('');
	// set once the first load has finished (or been skipped, without a token), so the pools are
	// imported once on startup, not from the defaults and then again from the tournament's
	let tournamentsLoaded = $state(false);
	async function loadTournaments() {
		const token = settings.current.ksnWebSocketToken.trim();
		if (!token) return;
		try {
			tournaments = await fetchConsoleTournaments(token);
			tournamentsError = '';
		} catch (e) {
			tournamentsError = e instanceof Error ? e.message : `${e}`;
		}
	}

	// the event's players and maps come from the console pools of the tournament the controls
	// follow: the picked one, else the race's, else the console's active one. A tournament with
	// no pool set, or none at all, uses the default pools
	const poolTournamentId = $derived(
		live.liveTournamentId ?? tournaments?.activeTournamentId ?? null
	);
	const poolTournament = $derived(tournaments?.tournaments.find((t) => t.id === poolTournamentId));
	const poolIds = $derived({
		playerPoolId: poolTournament?.playerPoolId || DEFAULT_PLAYER_POOL_ID,
		mapPoolId: poolTournament?.mapPoolId || DEFAULT_MAP_POOL_ID
	});
	const poolIdsKey = $derived(`${poolIds.playerPoolId}/${poolIds.mapPoolId}`);

	let poolImport: PoolImportResult | 'importing' | undefined = $state();
	// the pools last asked for, so they're only imported again when they change
	let importedPoolsKey: string | undefined;
	async function importPools() {
		const key = poolIdsKey;
		importedPoolsKey = key;
		poolImport = 'importing';
		const result = await importConsolePools(poolIds);
		// a later import, for other pools, shows its own result
		if (importedPoolsKey === key) poolImport = result;
	}
	$effect(() => {
		if (tournamentsLoaded && poolIdsKey !== importedPoolsKey) untrack(importPools);
	});
	// a tournament made, or given other pools, since the list was loaded: load it again, once
	// for each tournament it's missing
	let reloadedForTournament: string | undefined;
	$effect(() => {
		const id = poolTournamentId;
		if (!tournaments || !id || poolTournament || id === reloadedForTournament) return;
		reloadedForTournament = id;
		untrack(loadTournaments);
	});
	// the nav's re-import button: picks up pools changed on the console, then imports them
	// (unless reloading the list already started importing other pools)
	async function reimportPools() {
		const before = importedPoolsKey;
		await loadTournaments();
		if (importedPoolsKey === before) importPools();
	}

	function connectConsole() {
		const token = settings.current.ksnWebSocketToken.trim();
		ksnWs!.connect(token);
		live.connect(token, consoleBaseUrl());
		loadTournaments();
	}

	// the player lists, so the 'follow race' switch can refresh them as it's pressed
	let playerControls: (PlayerControl | undefined)[] = $state([]);

	let error = $state({
		invalidJfRelayToken: {
			state: false,
			msg: 'error: invalid jf relay websocket token'
		} as Error
	});

	onMount(() => {
		ksnWs = new KSNWebSocketController('ksnWs');
		// settings saved before this option existed don't have it; it defaults to on
		if (settings.current.followConsoleStageMap === undefined) {
			settings.current.followConsoleStageMap = true;
		}
		if (settings.current.followRacePlayers === undefined) {
			settings.current.followRacePlayers = true;
		}
		if (settings.current.selectDuelPlayers === undefined) {
			settings.current.selectDuelPlayers = true;
		}
		if (settings.current.ksnWebSocketToken) {
			live.connect(settings.current.ksnWebSocketToken, consoleBaseUrl());
		}

		loadTournaments().finally(() => (tournamentsLoaded = true));

		// with rtd on, the effect below connects instead (and checks the token)
		if (settings.current.jfRelayWebSocketToken && !rtdEnabled)
			jfRelayWs.connect(settings.current.jfRelayWebSocketToken);

		if (settings.current.jfGameServerToken) connectGameServer();

		if (settings.current.obsWsPw) {
			obsConnect(settings.current.obsWsIp, settings.current.obsWsPort, settings.current.obsWsPw);
		}

		// untracked: setScene reads the obs connection's state and connectToJfRelay the settings,
		// which would make these re-run on a reconnect or any settings change
		$effect(() => {
			const scene = overlayScene;
			if (scene) untrack(() => setScene(scene));
		});

		$effect(() => {
			if (rtdEnabled) untrack(connectToJfRelay);
		});

		// donations roll RTD effects only from here, as there's only ever one controls page: run
		// anywhere else as well, a donation could fire twice
		$effect(() => {
			if (rtdEnabled) return untrack(watchRtdDonations);
		});

		// TEST ONLY: fake donations for every page, made up here so there's only one source
		$effect(() => {
			if (TEST_DONATIONS_ALLOWED && testDonations.enabled) return startTestDonations();
		});

		return () => live.close();
	});

	async function connectToJfRelay() {
		// the mini leaderboard page keeps its own relay connection; reconnect it too
		const channel = new BroadcastChannel('jfRelayWs');
		channel.postMessage({ type: 'connect', value: settings.current.jfRelayWebSocketToken });
		channel.close();
		error.invalidJfRelayToken.state = await new Promise<boolean>((res) => {
			jfRelayWs?.connect(settings.current.jfRelayWebSocketToken.trim());
			jfRelayWs?.addEventListener('open', () => res(false));
			jfRelayWs?.addEventListener('error', () => res(true));
		});
	}
</script>

<ControlsNav
	{poolImport}
	importPools={reimportPools}
	onconnectconsole={connectConsole}
	onconnectrelay={connectToJfRelay}
	relayError={error.invalidJfRelayToken.state ? error.invalidJfRelayToken.msg : undefined}
/>

<section class="flex flex-col gap-2">
	{#if ksnWs}
		<!-- clear what's on air: outlined in red, and each needs a second click -->
		<div class="relative m-2 flex w-full max-w-lg flex-wrap justify-center gap-2 self-center">
			<ConfirmButton
				variant="danger"
				onconfirm={() => {
					// in console time, so it compares with the race's own timestamps
					overlay.current.timersClearedAt = Date.now() + live.clockOffset;
				}}>clear timers</ConfirmButton
			>
			<ConfirmButton
				variant="danger"
				onconfirm={() => {
					// in console time, like the timers
					overlay.current.miniLeaderboardClearedAt = Date.now() + live.clockOffset;
				}}>clear mini leaderboard</ConfirmButton
			>
			<ConfirmButton variant="danger" onconfirm={() => ksnWs!.clearPicksAndBans()}
				>clear map picks and bans</ConfirmButton
			>
			<!-- puts the last session back on air, for when a reconnect, an overlay refresh or a clear
			     loses it: the newer of the last one the overlay received and the console's latest
			     completed one -->
			<ConfirmButton variant="danger" onconfirm={() => ksnWs!.restorePicksAndBans()}
				>restore last map picks</ConfirmButton
			>
			<!-- undoes 'clear mini leaderboard': the current race's board shows again -->
			<ConfirmButton
				variant="danger"
				onconfirm={() => (overlay.current.miniLeaderboardClearedAt = undefined)}
				>restore mini leaderboard</ConfirmButton
			>
			{#if ksnWs.restored !== undefined}
				<p class="w-full text-center text-ctp-subtext0" aria-live="polite">
					{ksnWs.restored ? `restored ${ksnWs.restored}` : 'no map picks to restore'}
				</p>
			{/if}
		</div>

		<!-- MARK: live
        what changes during the show, always visible: the OBS scene and players A and B -->
		<section class="flex w-full max-w-lg flex-col gap-3 self-center" aria-label="live controls">
			<Group label="scene">
				<RadioInputs
					opts={OverlayScenes.filter((s) => !BrokenOverlayScenes.includes(s))}
					bind:value={settings.current.overlayScene}
					onpick={(scene) => scene && setScene(scene)}
				/>
			</Group>

			<!-- picking one also switches OBS to the idle scene -->
			<Group label="idle scene overlay">
				<RadioInputs
					opts={IdleOverlayScenes}
					bind:value={settings.current.idleOverlayScene}
					onpick={() => setScene(idleOBSSceneName())}
				/>
			</Group>

			<!-- players: the automations that can change the picks below, a click away -->
			<Group label="players">
				{#snippet action()}
					<AutoToggle
						setting="selectDuelPlayers"
						label="auto-select"
						desc="select the players when a 1v1 race or map pick starts"
					/>
					<AutoToggle
						setting="followRacePlayers"
						label="filter to current race"
						desc="list only the current race's players, in race order"
						ontoggle={() => playerControls.forEach((c) => c?.refresh(true))}
					/>
				{/snippet}
				<!-- their bracket match's score and best of, over the two lists -->
				<MatchScore />
				<!-- two equal columns, so both lists' rows are the same width -->
				<div class="grid grid-cols-2 gap-x-6">
					<PlayerControl bind:this={playerControls[0]} playerNum={0} />
					<PlayerControl bind:this={playerControls[1]} playerNum={1} />
					<!-- disabled since 4 player POV is not implemented yet -->
					<!-- <PlayerControl player={overlay.current.players[2]} playerNum={2} />
					<PlayerControl player={overlay.current.players[3]} playerNum={3} /> -->
				</div>
			</Group>
		</section>
		<hr class="hr w-full max-w-lg self-center" />

		<!-- MARK: scene content
        what the scenes show: set up before a segment, rarely changed during one -->
		<Accordion title="scene content" defaultstate="closed">
			<!-- <Group label="idle OBS scene name">
				<input
					type="text"
					class="input"
					aria-label="idle OBS scene name"
					placeholder="Idle"
					title="name of the OBS scene this overlay is shown on, without backgrounds"
					value={settings.current.idleObsScene}
					onchange={(e) => (settings.current.idleObsScene = (e.target as HTMLInputElement).value)}
				/>
			</Group> -->

			<Group label="leaderboard tournament">
				{#snippet action()}
					<button class="button-link" onclick={loadTournaments}>refresh</button>
				{/snippet}
				{#if tournamentsError}
					<span class="text-red-300">{tournamentsError}</span>
				{/if}
				<RadioInputs
					opts={['', ...(tournaments?.tournaments.map((t) => t.id) ?? [])]}
					optlabels={[
						"follow race's tournament",
						...(tournaments?.tournaments.map(
							(t) => t.name + (t.id === tournaments?.activeTournamentId ? ' (active)' : '')
						) ?? [])
					]}
					bind:value={overlay.current.tournament}
				/>
			</Group>

			<Group label="leaderboard view">
				<RadioInputs
					opts={[
						...(isDuelTournament ? [] : ['standings' as const]),
						...leaderboardRounds.map((r) => r.roundIndex),
						...(isDuelTournament ? [] : ['final' as const])
					]}
					optlabels={[
						...(isDuelTournament ? [] : ['current standings']),
						...leaderboardRounds.map((r) =>
							isDuelTournament
								? duelRoundLabel(r)
								: `${roundNumber(live.tournament?.rounds ?? [], r)}: ${r.map ? mapName(r.map) : r.stage}`
						),
						...(isDuelTournament ? [] : ['final standings'])
					]}
					bind:value={() => leaderboardView, (view) => (overlay.current.leaderboardView = view)}
				/>
			</Group>

			<Group label="bracket">
				<EditBracket />
				<div class="m5"></div>
				{#if items.current.brackets?.length}
					<RadioInputs
						opts={items.current.brackets.map((b) => b.id)}
						optlabels={items.current.brackets.map((b) => b.name)}
						bind:value={overlay.current.bracket}
					/>
				{:else}
					<!-- the same as under 'players, maps, and brackets', so there's no hunting for it -->
					<div class="flex flex-wrap items-center gap-2">
						<span class="opacity-60">no brackets yet</span>
					</div>
				{/if}
			</Group>

			<Group label="class">
				<RadioInputs
					opts={TFClasses.filter((c) => c !== 'overall')}
					bind:value={settings.current.tfClass}
				/>
			</Group>

			<Group label="schedule day">
				{#snippet action()}
					<button
						class="button-link"
						title="re-fetch the sheet in the controls and on the overlay"
						disabled={schedule.loading}
						onclick={refreshSchedule}>refresh</button
					>
				{/snippet}
				<RadioInputs
					opts={scheduleDays.map((_, i) => i)}
					optlabels={scheduleDays.map((d) => d.name)}
					bind:value={
						() => settings.current.scheduleDay ?? 0, (day) => (settings.current.scheduleDay = day)
					}
					onchange={() => schedule.load(scheduleSheetUrl())}
				/>
				{#if schedule.loading}
					<span class="text-ctp-subtext0">loading...</span>
				{:else if schedule.error}
					<span class="text-red-300">{schedule.error}</span>
				{:else if schedule.schedule}
					<span class="text-ctp-subtext0">
						{schedule.schedule.title} ({schedule.schedule.segments.length} segments)
					</span>
				{/if}
			</Group>
		</Accordion>

		<!-- MARK: map and stage
        the console sets these, so they're only here to override it; the summary shows what's set,
        since the section starts closed -->
		<Accordion
			title="map and stage"
			summary="{overlay.current.map || 'none'}, {overlay.current.stage || 'none'}"
			id="map-and-stage"
			defaultstate="closed"
		>
			{#snippet aside()}
				<AutoToggle
					setting="followConsoleStageMap"
					label="auto"
					desc="set the map and stage from the console"
				/>
			{/snippet}
			<Group label="map">
				<RadioInputs
					opts={poolMaps()}
					optlabels={settings.current.useShortMapNames
						? poolMaps().map((m) => getMap(m).shortName || m)
						: undefined}
					bind:value={overlay.current.map}
				/>
			</Group>

			<Group label="stage">
				{#snippet action()}
					<ConfirmButton
						variant="danger"
						onconfirm={() => (items.current.stages = [...defaultStages])}
						>reset to default</ConfirmButton
					>
				{/snippet}
				<ItemInput placeholder="add stage" item="stages" class="pb-1" />
				<RadioInputs opts={[...items.current.stages]} bind:value={overlay.current.stage} />
			</Group>
		</Accordion>

		<!-- MARK: setup -->
		<Accordion title="players, maps, and brackets" defaultstate="closed">
			<div class="grid w-full grid-cols-2">
				<Importplayer />
				<ManagePlayers />
				<ImportMap />
				<ManageMaps />
				<EditBracket />
				<ManageBrackets />
			</div>
		</Accordion>

		<Accordion title="visual settings" defaultstate="closed">
			<Group label="font">
				{#snippet action()}
					<ConfirmButton variant="danger" onconfirm={resetVisualSettings}
						>reset visual settings</ConfirmButton
					>
				{/snippet}
				<RadioInputs opts={[...Fonts]} bind:value={settings.current.font} />
			</Group>

			<Group label="mono font">
				<RadioInputs opts={[...MonoFonts]} bind:value={settings.current.monoFont} />
			</Group>

			<Group label="theme">
				<div class="flex gap-2">
					<div
						class="size-12 border-4 border-ctp-text bg-ctp-lavender"
						style:filter={getFiltersStyle()}
					></div>
					<div class="flex flex-col justify-evenly">
						<RangeInput setting="hue" max={360} />
						<RangeInput setting="saturation" max={200} />
					</div>
				</div>
			</Group>

			<Group label="options">
				<Checkbox desc="show flags" setting="enableFlags" />
				<Checkbox desc="show player avatars" setting="enableAvatars" />
				<Checkbox desc="show stage" setting="enableStage" />
				<!-- <Checkbox desc="show tags" setting="enableTags" /> -->
				<!-- <Checkbox desc="use moving background" setting="enableMovingBG" /> -->
				<!-- <Checkbox desc="use short map names" setting="useShortMapNames" /> -->
				<!-- <Checkbox desc="show POV guide" setting="enablePOVGuide" /> -->
				<Checkbox desc="show gradient backgrounds" setting="enableGradient" />
				{#if settings.current.enableGradient}
					<Checkbox class="ml-5" desc="use red & blue team colors" setting="enableTeamColors" />
				{/if}
				<!-- <Checkbox desc="use player PRs" setting="enablePRs" /> -->
			</Group>
		</Accordion>
	{/if}

	<!-- last on the page, out of the way of anything used during a show -->
	<div class="mt-8 flex flex-col items-center gap-1 self-center text-center">
		<ConfirmButton
			variant="danger"
			title="clear every setting, token, player, map and the fundraising state, then reload"
			onconfirm={hardReset}>HARD RESET</ConfirmButton
		>
		<span class="text-sm opacity-60">clears everything saved, tokens included, and reloads</span>
	</div>
</section>
