<script lang="ts">
	import { getFiltersStyle } from '$lib/filters.svelte';
	import { settings } from '$lib/storage.svelte';
	import { fade, slide } from 'svelte/transition';
	import MatchMapPicks from '$lib/components/match/MatchMapPicks.svelte';
	import WebSocketTimer from '$lib/components/match/WebSocketTimer.svelte';
	import Flag from '$lib/components/util/Flag.svelte';
	import { getContext } from 'svelte';
	import { getPlayer, msToFormattedTime } from '$lib/util';
	import type { ConsoleLive } from '$lib/websockets/console/console-live.svelte';
	import type { DelayedPlayers } from '$lib/delayed-players.svelte';
	// import WebSocketLeader from '$lib/components/match/WebSocketLeader.svelte';
	import MiniLeaderboard from '$lib/components/match/MiniLeaderboard.svelte';
	import RoundTab from '$lib/components/match/RoundTab.svelte';
	import BottomArea from '$lib/components/match/BottomArea.svelte';
	import { bracketMatchBetween } from '$lib/bracket-live.svelte';
	import { bestOfOf, gameWins, playersOf, winsNeeded } from '$lib/Bracket.svelte';
	import type { SteamID3 } from '$lib/types.svelte';
	import { prSinceClear } from '$lib/components/match/timers-cleared';
	import { fitText } from '$lib/fit-text';
	import { isSingleRun } from '$lib/components/match/mini-leaderboard';

	// one scene for both match layouts, so switching between them animates the differences
	// instead of tearing one scene down and building the other
	type Props = { single?: boolean };
	let { single = false }: Props = $props();

	let live: ConsoleLive = getContext('consoleLive');
	// the selected players, switched as late as the in-game spectator switches
	let shown: DelayedPlayers = getContext('overlayPlayers');

	// the shown players' bracket match, for their games won: only longer than a best of 1, as
	// that one's score would only ever be its winner, and not during a mass race, which isn't
	// part of a match
	const match = $derived(bracketMatchBetween(shown.players[0], shown.players[1]));
	const massRace = $derived(!!live.currentRace && live.currentRace.mode !== 'duel');
	// everyone gets one run, so there's no PR or games won to show: the name takes the full height
	const massSingle = $derived(live.currentRace?.mode === 'mass-single');
	// a single run race shows one shared timer in the middle of the timer box, leaving its outer
	// columns empty: the names can run into those
	const sharedTimer = $derived(
		settings.current.ksnWebSocketToken !== '' && isSingleRun(live.currentRace)
	);
	// the dual layout's player slot width (see the top bar)
	const dualSlotWidth = $derived(
		sharedTimer ? 'w-[calc(40.83%-1.18rem)]' : 'w-[calc(22.5%-1.55rem)]'
	);

	// the name's size, in px for fitText (tailwind's text-6xl, 5xl, 4xl and 3xl at a 16px rem)
	const TEXT_4XL_PX = 36;
	function nameSizePx(massSingle: boolean, single: boolean): number {
		if (massSingle) return single ? 60 : 48;
		return single ? TEXT_4XL_PX : 30;
	}
	const series = $derived.by(() => {
		if (!match || massRace || bestOfOf(match.bracket, match.id) < 2) return undefined;
		const [A, B] = playersOf(match.bracket, match.id);
		const wins = gameWins(match.bracket, match.id);
		return {
			needed: winsNeeded(match.bracket, match.id),
			winsOf: (steamID3: SteamID3 | undefined) =>
				steamID3 == A ? wins.A : steamID3 == B ? wins.B : 0
		};
	});
</script>

<!-- MARK: top bar -->
<div class="relative z-20 flex h-32 w-full justify-between p-4">
	{#if settings.current.ksnWebSocketToken !== ''}
		<!-- the box glides between the two layouts' timer positions -->
		<div
			class="absolute transition-all duration-500 ease-in-out
                {single ? 'top-6 left-[calc(46%-2.5rem)] w-[54%]' : 'top-11 left-[22.5%] w-[55%]'}"
		>
			{#key single}
				<div in:fade style:filter={getFiltersStyle()}>
					<WebSocketTimer numPlayers={single ? 1 : 2} class="w-full" />
				</div>
			{/key}
		</div>
		<!-- {#if single}
			<div transition:fade class="pointer-events-none absolute inset-0">
				<WebSocketLeader class="absolute top-4 right-90" />
			</div>
		{/if} -->
	{/if}
	<!-- gradients: both layouts' gradients stay in place and crossfade -->
	{#if settings.current.enableGradient}
		{#if settings.current.enableTeamColors}
			<div
				class="absolute top-0 left-0 size-full bg-linear-to-r from-ctp-blue/35 via-black/35 to-ctp-red/35 transition-opacity duration-500
                {single ? 'opacity-0' : ''}"
			></div>
			<div
				class="absolute top-0 left-0 size-full bg-linear-to-r from-ctp-blue/35 to-black/35 transition-opacity duration-500
                {single ? '' : 'opacity-0'}"
			></div>
		{:else}
			<div
				class="absolute top-0 left-0 size-full bg-linear-to-r from-ctp-lavender/35 via-black/35 to-ctp-lavender/35 transition-opacity duration-500
                {single ? 'opacity-0' : ''}"
				style:filter={getFiltersStyle()}
			></div>
			<div
				class="absolute top-0 left-0 size-full bg-linear-to-r from-ctp-lavender/35 to-black/35 transition-opacity duration-500
                {single ? '' : 'opacity-0'}"
				style:filter={getFiltersStyle()}
			></div>
		{/if}
	{:else}
		<!-- transparent black bg -->
		<div class="absolute top-0 left-0 size-full bg-black/35"></div>
	{/if}

	<!-- each player's slot ends 1rem short of the timer box, so a long name fits up to it: single,
	     the box starts at 46% - 2.5rem; dual, at 22.5%, or at its middle column (22.5% + 55% / 3)
	     when that's all it shows. the box's percentages are of the bar's width with its padding,
	     the slots' of the bar's width inside it, hence the rem adjustments -->
	<div
		class="h-full shrink-0 transition-[width] duration-500
            {single ? 'w-[calc(46%-3.6rem)]' : dualSlotWidth}"
	>
		{@render OverlayPlayer(shown.players[0], 0)}
	</div>
	{#if !single}
		<div transition:fade class="h-full shrink-0 transition-[width] duration-500 {dualSlotWidth}">
			{@render OverlayPlayer(shown.players[1], 1)}
		</div>
	{/if}
</div>
<!-- isolated border filter -->
<div class="border-b-4 border-ctp-lavender/50" style:filter={getFiltersStyle()}></div>

<!-- MARK: round tab -->
<!-- the stage and map hang from the top bar: dual, centred over the seam between the povs;
     single, against the right edge where the old map tag was -->
<RoundTab
	align={single ? 'right' : 'center'}
	class="absolute top-33 z-20 {single ? 'right-0' : 'left-1/2 -translate-x-1/2'}"
/>

<!-- MARK: POVs -->
{#if !single}
	<div
		transition:slide={{ duration: 500 }}
		class="flex w-full border-b-4 border-ctp-lavender/50"
		style:filter={getFiltersStyle()}
	>
		<div
			class="aspect-video w-1/2
  {settings.current.enablePOVGuide
				? 'border-r-2 border-dashed border-ctp-lavender/50 bg-ctp-lavender/25'
				: ''}"
		></div>
		<div
			class="aspect-video w-1/2
  {settings.current.enablePOVGuide
				? 'border-l-2 border-dashed border-ctp-lavender/50 bg-ctp-lavender/25'
				: ''}"
		></div>
	</div>
{/if}

<!-- MARK: bottom area -->
<!-- dual: chat space, mini leaderboard, fundraising and map picks under the povs -->
{#if !single}
	<div transition:fade={{ duration: 500 }} class="flex min-h-0 flex-1">
		<BottomArea />
	</div>
{/if}

<!-- MARK: single: mini leaderboard and map picks -->
{#if single}
	<div
		transition:fade={{ duration: 500 }}
		class="absolute top-1/2 left-4 flex h-97 w-130 -translate-y-1/2"
	>
		<MiniLeaderboard class="flex-1" translucent />
	</div>
	<MatchMapPicks class="absolute bottom-4 left-4 z-1 h-32 w-200" />
{/if}

<!-- MARK: OverlayPlayer -->
{#snippet OverlayPlayer(steamID3: number | undefined, playerNum: number)}
	{@const player = getPlayer(steamID3)}
	{@const flag = player.flag}
	{@const avatarURL = player.avatarURL}
	{@const tag = player.tag}
	{@const name = player.name}
	<!-- blank once 'clear timers' is pressed, until a new PR -->
	{@const pr = prSinceClear(live.entryFor(steamID3), live.currentRace)}
	<div class="relative z-10 flex h-full w-full gap-4 {playerNum === 1 ? 'flex-row-reverse' : ''}">
		<!-- flag -->
		{#if settings.current.enableFlags && flag}
			<Flag code={flag} class="flex h-fit w-fit shrink-0 rounded-xl text-[6rem]" />
		{/if}
		{#if settings.current.enableAvatars && avatarURL}
			{#key avatarURL}
				<img
					in:fade
					src={avatarURL}
					alt=""
					class="size-24 shrink-0 rounded-xl object-cover object-center"
					draggable="false"
				/>
			{/key}
		{/if}
		<div
			class="flex min-w-0 flex-1 flex-col {playerNum === 1 ? 'items-end' : 'items-start'}
                {massSingle ? 'justify-center' : ''}"
			style:filter={getFiltersStyle()}
		>
			<!-- mirrored for player 2, so the tag sits on the outside and the name runs toward the
			     timer -->
			<div
				class="flex w-full items-baseline gap-2 transition-[margin] duration-500
                    {playerNum === 1 ? 'flex-row-reverse' : ''} {massSingle ? '' : 'mb-3'}"
			>
				<!-- tag -->
				{#if settings.current.enableTags && tag}
					{#key tag}
						<span in:fade class="shrink-0 text-4xl text-ctp-text/75">{tag}</span>
					{/key}
				{/if}
				<!-- name: a little bigger when it's the only player, and bigger still when it has
				     the full height to itself. a long one shrinks to fit, down to text-4xl (or its
				     own size, if smaller), and is cut off with an ellipsis past that -->
				{#key name}
					<span
						in:fade
						class="min-w-0 flex-1 truncate font-bold transition-[font-size] duration-500
                        {playerNum === 1 ? 'text-right' : ''}"
						{@attach fitText(
							{ max: nameSizePx(massSingle, single), min: TEXT_4XL_PX },
							name,
							settings.current.font
						)}>{name}</span
					>
				{/key}
			</div>
			<!-- games won, then PRs: collapses away for a mass-single race -->
			{#if !massSingle}
				<div
					transition:slide={{ duration: 500 }}
					class="flex gap-2 text-ctp-text/75
                                {playerNum === 1 ? 'flex-row-reverse' : ''}"
				>
					{#if series}
						{@const wins = series.winsOf(steamID3)}
						<!-- one box per game needed to win, filled from the outside in -->
						<div
							transition:fade
							class="flex h-8 gap-2 {playerNum === 1 ? 'flex-row-reverse' : ''}"
							aria-label="{wins} of {series.needed} games won"
						>
							{#each { length: series.needed }, i (i)}
								<span
									class="size-7 rounded-md border-4 transition-colors duration-500
                                    {i < wins
										? 'border-ctp-text bg-ctp-lavender'
										: 'border-ctp-text/50 bg-transparent'}"
								></span>
							{/each}
						</div>
					{/if}
					<div
						class="-mt-4 mr-2 ml-2 flex h-16 max-w-55 flex-wrap items-center
                                        {playerNum === 1 ? 'flex-row-reverse' : ''}
                                        {settings.current.monoFont}"
					>
						{#if settings.current.enablePRs}
							<div class="flex gap-2">
								{#if pr !== null}
									<span class="text-xl opacity-80 {settings.current.font}">pr</span>
									<span class="text-3xl">
										{msToFormattedTime(pr)}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/snippet}
