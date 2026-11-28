<script lang="ts">
	import { Dwb } from '$lib/api/dwb/api-dwb';
	import { fundraisingState, settings } from '$lib/storage.svelte';
	import type { Donation } from '$lib/types.svelte';
	import { sleep } from '$lib/util';
	import { getFiltersStyle } from '$lib/filters.svelte';
	import { onDestroy, type Snippet } from 'svelte';
	import { fade, type TransitionConfig } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { fitItems } from '$lib/fit-text';
	import { rtdEffectFor, rtdEffectLabel } from '$lib/rtd-effect';

	// two donation cards side by side, filling the size the scene gives them: the top donations
	// (up to five, as many as fit with their full messages) on the left, the latest on the right
	// (highlighted for a while when it comes in, then joined by the ones before it; a donation
	// that rolls an RTD effect splits it, the effect showing in a card under it). compact
	// cards (when the scene is short on room) show just the name and amount. without
	// recentMessages the recent donations list does too (eg: while map picks show), its text
	// shrunk a little so three fit. tight cards (eg: while map picks show) have less padding and
	// tighter lines, so two top donations with a line of message each fit at a near full size
	type Props = { class?: string; compact?: boolean; recentMessages?: boolean; tight?: boolean };
	let {
		class: styleClass = '',
		compact = false,
		recentMessages = true,
		tight = false
	}: Props = $props();

	const HIGHLIGHT_MS = 10 * 1000;
	const RECENT_AFTER_MS = 30 * 1000;

	let donations: Donation[] = $state([]);
	let processing = false;
	let destroyed = false;

	// the latest donation card steps through new donations one at a time, so the cursor is the
	// donation it's showing. it's saved, so a reloaded overlay doesn't replay old donations
	const cursor = () => fundraisingState.current.lastDonationProcessedByMessagesId;
	let shownCount = $derived(donations.findIndex((d) => d.id === cursor()) + 1);
	let latest = $derived(shownCount > 0 ? donations[shownCount - 1] : undefined);
	// the biggest donations shown so far, biggest first (the earliest first on a tie, as the sort
	// is stable), so none jumps ahead of the latest card while that's still stepping through a
	// batch. the card shows as many as fit whole
	const MAX_TOP = 5;
	let top = $derived(
		donations
			.slice(0, shownCount)
			.sort((a, b) => b.amount - a.amount)
			.slice(0, MAX_TOP)
	);

	let highlightedId = $state('');
	let highlightTimeout: ReturnType<typeof setTimeout> | undefined;
	let highlighted = $derived(!!latest && latest.id === highlightedId);

	// a new donation has the right card to itself for a while, then the card shows the latest
	// few stacked (latest first), as many as fit. a (re)loaded overlay has nothing new, so it
	// starts stacked
	const MAX_RECENT = 4;
	let showRecent = $state(true);
	let recentTimeout: ReturnType<typeof setTimeout> | undefined;
	let recent = $derived(
		showRecent ? donations.slice(Math.max(0, shownCount - MAX_RECENT), shownCount).reverse() : []
	);

	// the effect the latest donation rolled, worked out the same way the controls do when they
	// send it. shown with the donation, until the next one or the recent donations list
	let latestRtd = $derived(
		settings.current.enableFundraisingRtd && latest ? rtdEffectFor(latest) : undefined
	);

	// opens a card sharing a column with flex-1 by growing its share from nothing (a slide would
	// animate its height, which flex-1 overrides), its gap above opening with it
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- svelte passes the node
	function grow(_node: Element): TransitionConfig {
		return {
			duration: 500,
			easing: cubicInOut,
			css: (t) => `flex-grow: ${t}; padding-top: ${t * 0.875}rem`
		};
	}

	const iterateDonations = () => settings.current.enableFundraisingDonations;

	const donationsSubId = Dwb.subscribeToDonations((d) => {
		donations = d;
		// a new event (or a cursor that's gone): start at the latest donation instead of
		// replaying the whole event
		if (d.length > 0 && !d.some((x) => x.id === cursor())) {
			fundraisingState.current.lastDonationProcessedByMessagesId = d.at(-1)!.id;
		}
		processNewDonations();
	});

	onDestroy(() => {
		destroyed = true;
		clearTimeout(highlightTimeout);
		clearTimeout(recentTimeout);
		Dwb.unsubscribeFromDonations(donationsSubId);
	});

	async function processNewDonations() {
		if (processing) return;

		processing = true;
		let pending = unprocessed();
		while (pending.length > 0) {
			if (destroyed) return;
			if (!iterateDonations()) {
				await sleep(2 * 1000);
				pending = unprocessed();
				continue;
			}

			const d = pending[0];
			fundraisingState.current.lastDonationProcessedByMessagesId = d.id;
			highlight(d.id);

			// give this one its time before a next one (waiting or arriving meanwhile) replaces it
			await sleep(settings.current.fundraisingShowDonationSeconds * 1000);
			pending = unprocessed();
		}

		processing = false;
	}

	function highlight(id: string) {
		highlightedId = id;
		clearTimeout(highlightTimeout);
		highlightTimeout = setTimeout(() => (highlightedId = ''), HIGHLIGHT_MS);

		showRecent = false;
		clearTimeout(recentTimeout);
		recentTimeout = setTimeout(() => (showRecent = true), RECENT_AFTER_MS);
	}

	function unprocessed(): Donation[] {
		const idx = donations.findIndex((d) => d.id === cursor());
		return donations.slice(idx + 1);
	}
</script>

<!-- a donation's name, amount and message (not in compact cards), sized in em from the card's
     18px, so the top donations' list can shrink them to fit -->
{#snippet entry(donation: Donation, peach: boolean, lines: string, message = true)}
	<div class="flex items-center gap-2.5 {tight ? 'leading-tight' : ''}">
		<span class="truncate text-[1.1667em] font-bold" style:filter={getFiltersStyle()}
			>{donation.name || 'Anonymous'}</span
		>
		<span
			class="ml-auto text-[1.1667em] transition-colors duration-500
			{peach ? 'text-ctp-peach' : 'text-ctp-lavender'} {settings.current.monoFont}"
			style:filter={getFiltersStyle()}
		>
			${donation.amount.toLocaleString('en-US')}
		</span>
	</div>
	{#if donation.message && message && !compact}
		<p
			class="m-0 {lines} text-[1em]
                        {tight
				? 'leading-tight'
				: 'leading-snug'} wrap-break-word text-ctp-subtext1"
			style:filter={getFiltersStyle()}
		>
			{donation.message}
		</p>
	{/if}
{/snippet}

<!-- a card's background and heading, with its content crossfading whenever key changes -->
{#snippet card(key: string, header: string, peach: boolean, content: Snippet, cls = '')}
	<div class="relative isolate min-h-0 {cls}">
		<div
			class="absolute inset-0 -z-1 rounded-[10px] ring-1 transition-colors duration-500 ring-inset
			{peach ? 'bg-[#1d1410]/92 ring-ctp-peach/70' : 'bg-[#0f0f16]/92 ring-ctp-lavender/35'}"
			style:filter={getFiltersStyle()}
		></div>
		{#key key}
			<!-- absolute, so the outgoing and incoming content overlap as they fade. going tight
			     eases its padding and gap, alongside the map picks sliding in -->
			<div
				class="absolute inset-0 flex flex-col overflow-hidden px-4.5 text-[18px] transition-[padding,gap] duration-500 ease-in-out {tight
					? 'gap-1 py-2.5'
					: 'gap-2 py-3.5'}"
				transition:fade={{ duration: 400 }}
			>
				<span
					class="{tight
						? 'text-xs'
						: 'text-sm'} font-bold tracking-wider uppercase transition-[color,font-size,line-height] duration-500 ease-in-out
					{peach ? 'text-ctp-peach' : 'text-ctp-overlay2'}"
					style:filter={getFiltersStyle()}>{header}</span
				>
				{@render content()}
			</div>
		{/key}
	</div>
{/snippet}

<div class="{styleClass} grid grid-cols-2 gap-3.5">
	{#if top.length > 0}
		{#snippet topContent()}
			<!-- full messages, never clamped. the column wraps, so whichever don't fit whole move
			     into a second column outside the card and are clipped; the text shrinks a little (to
			     14px) so two fit: in a tight card, enough for two with a line of message each, and further only when the
			     biggest donation alone wouldn't fit -->
			<div
				class="flex min-h-0 flex-1 flex-col flex-wrap content-start overflow-hidden"
				{@attach fitItems(
					18,
					[
						[2, 14],
						[1, 11]
					],
					tight
				)}
			>
				{#each top as d, i (d.id)}
					<div
						class="relative flex w-full shrink-0 flex-col gap-0.5 {i > 0
							? tight
								? 'pt-1.5'
								: 'pt-2'
							: ''}"
					>
						{#if i > 0}
							<div
								class="absolute inset-x-0 {tight ? 'top-0.5' : 'top-1'} h-px bg-ctp-lavender/20"
								style:filter={getFiltersStyle()}
							></div>
						{/if}
						{@render entry(d, false, '')}
					</div>
				{/each}
			</div>
		{/snippet}
		{@render card(
			top.map((d) => d.id).join(),
			top.length > 1 ? 'Top Donations' : 'Top Donation',
			false,
			topContent
		)}
	{:else}
		<div></div>
	{/if}

	{#if latest}
		<!-- one card for both views, so switching between them crossfades -->
		{@const stacked = recent.length > 1}
		{@const rtd = stacked ? undefined : latestRtd}
		{#snippet rightContent()}
			{#if stacked}
				<!-- a line of message each. the column wraps, so whichever don't fit fully move into
				     a second column outside the card and are clipped: as many show as fit. without
				     messages (while map picks show) the text shrinks a little so three fit -->
				<div
					class="flex min-h-0 flex-1 flex-col flex-wrap content-start overflow-hidden"
					{@attach fitItems(18, [[recentMessages && !compact ? 1 : 3, 12]], tight)}
				>
					{#each recent as d, i (d.id)}
						<div
							class="relative flex w-full shrink-0 flex-col gap-0.5 {i > 0
								? tight
									? 'pt-1.5'
									: 'pt-2'
								: ''}"
						>
							{#if i > 0}
								<div
									class="absolute inset-x-0 {tight ? 'top-0.5' : 'top-1'} h-px bg-ctp-lavender/20"
									style:filter={getFiltersStyle()}
								></div>
							{/if}
							{@render entry(d, false, 'line-clamp-1', recentMessages)}
						</div>
					{/each}
				</div>
			{:else}
				<!-- half the height with an rtd card under it, so a line of message -->
				{@render entry(latest!, highlighted, rtd ? 'line-clamp-1' : 'line-clamp-2')}
			{/if}
		{/snippet}
		<!-- an rtd donation splits the column in half: the rtd card slides open under the
		     latest donation, which shrinks to make room (and grows back as it slides shut) -->
		<div class="flex min-h-0 flex-col">
			{@render card(
				stacked ? `recent-${latest.id}` : latest.id,
				stacked ? 'Recent Donations' : 'Latest Donation',
				highlighted && !stacked,
				rightContent,
				'flex-1'
			)}
			{#if rtd}
				<div class="flex min-h-0 flex-1 flex-col pt-3.5" transition:grow>
					{#snippet rtdContent()}
						<div class="flex items-baseline gap-2.5 {tight ? 'leading-tight' : ''}">
							<span
								class="truncate text-[1.5em] font-bold text-white"
								style:filter={getFiltersStyle()}>{rtdEffectLabel(rtd.effect)}</span
							>
						</div>
					{/snippet}
					{@render card(`rtd-${latest.id}`, 'Roll The Dice', highlighted, rtdContent, 'flex-1')}
				</div>
			{/if}
		</div>
	{/if}
</div>
