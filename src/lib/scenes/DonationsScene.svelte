<script lang="ts">
	import SceneFrame from '$lib/components/scene/SceneFrame.svelte';
	import PicksStarted from '$lib/components/scene/PicksStarted.svelte';
	import SceneHeader from '$lib/components/scene/SceneHeader.svelte';
	import SceneTag from '$lib/components/scene/SceneTag.svelte';
	import { Dwb } from '$lib/api/dwb/api-dwb';
	import { getFiltersStyle } from '$lib/filters.svelte';
	import { fundraisingState, settings } from '$lib/storage.svelte';
	import type { Donation, DonationMilestone, DonationsOverview } from '$lib/types.svelte';
	import { onDestroy, onMount } from 'svelte';
	import RocketProgressBar, { FILL_IN } from '$lib/components/fundraising/RocketProgressBar.svelte';
	import { Tween } from 'svelte/motion';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const EVENT_NAME = 'Jump4Charity';
	const CHARITY = 'Doctors Without Borders';
	// the latest donations, scrolled through in a loop when they don't fit the column
	const SHOWN_DONATIONS = 20;
	const SCROLL_PX_PER_SECOND = 40;
	const TOP_DONATIONS = 5;
	// every milestone is shown, at the biggest text size (px) that fits them all in the column
	const MILESTONE_SIZE = { max: 30, min: 12 };

	// MARK: data
	let overview: DonationsOverview = $state({ goal: 0, raised: 0, donationCount: 0 });
	let donations: Donation[] = $state([]);
	let milestones: DonationMilestone[] = $state([]);
	let loaded = $state(false);

	const hasEvent = !!fundraisingState.current.eventUrl;
	const subs = hasEvent
		? {
				overview: Dwb.subscribeToDonationsOverview((o) => {
					overview = o;
					loaded = true;
				}),
				donations: Dwb.subscribeToDonations((d) => (donations = d)),
				milestones: Dwb.subscribeToMilestones((m) => (milestones = m))
			}
		: undefined;

	onDestroy(() => {
		if (!subs) return;
		Dwb.unsubscribeFromDonationsOverview(subs.overview);
		Dwb.unsubscribeFromDonations(subs.donations);
		Dwb.unsubscribeFromMilestones(subs.milestones);
	});

	// MARK: progress
	// the total counts up with the rocket bar, and the goal is the bar's current target: the
	// event's goal, then every further 1000 once that's passed
	// it counts up from 0 as the bar fills in on a scene change, then follows the bar
	const fillIn = new Tween(0, FILL_IN);
	onMount(() => {
		fillIn.target = 1;
	});
	let raised = $derived(
		Math.round(fundraisingState.current.progressBar.sumRaised * fillIn.current)
	);
	let goal = $derived(fundraisingState.current.sumGoal || overview.goal);
	let goalReached = $derived(
		overview.goal > 0 && fundraisingState.current.progressBar.sumRaised >= overview.goal
	);

	// MARK: donations
	// the api lists them oldest first
	let recent = $derived(donations.slice(-SHOWN_DONATIONS).reverse());
	// the biggest, earliest first on a tie
	let top = $derived(
		donations
			.map((d, i) => ({ d, i }))
			.sort((a, b) => b.d.amount - a.d.amount || a.i - b.i)
			.slice(0, TOP_DONATIONS)
			.map(({ d }) => d)
	);

	// the list scrolls up at a steady speed and wraps by one copy's height (its rows plus the
	// gap before the next copy), so the second copy takes over seamlessly. a js loop instead of
	// a css animation, so the copy can grow as donations come in without the position jumping
	let viewHeight = $state(0);
	let copyHeight = $state(0);
	let offset = $state(0);
	let scrolling = $derived(copyHeight > viewHeight + 4);
	$effect(() => {
		if (!scrolling) {
			offset = 0;
			return;
		}
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(t) {
			offset = (offset + ((t - last) / 1000) * SCROLL_PX_PER_SECOND) % copyHeight;
			last = t;
			frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	});

	// MARK: milestones
	// dwb's isActive only says a milestone is enabled, not that it's the one being worked
	// towards, so the next milestone is the first not reached yet: marked complete by dwb, or
	// passed by the total before dwb catches up
	const reached = (m: DonationMilestone) => m.isComplete || m.goal <= overview.raised;
	let activeIndex = $derived(milestones.findIndex((m) => !reached(m)));

	// the rows are sized in em off the list's font size, which steps down from the max until
	// nothing overflows. re-fit when the milestones, the next one (it's bold), the column's
	// height or the font change
	let milestoneList: HTMLUListElement | undefined = $state();
	let milestoneListHeight = $state(0);
	$effect(() => {
		const list = milestoneList;
		if (!list) return;
		void [
			milestones,
			activeIndex,
			milestoneListHeight,
			settings.current.font,
			settings.current.monoFont
		];
		let size = MILESTONE_SIZE.max;
		list.style.fontSize = `${size}px`;
		while (list.scrollHeight > list.clientHeight && size > MILESTONE_SIZE.min) {
			list.style.fontSize = `${--size}px`;
		}
	});

	function usd(amount: number): string {
		return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
	}
</script>

<SceneFrame class="gap-10">
	<SceneHeader eventName={EVENT_NAME} title="Donations">
		{#snippet subtitle()}
			<span
				class="text-5xl leading-tight font-bold text-ctp-lavender uppercase"
				style:filter={getFiltersStyle()}
			>
				towards {CHARITY}
			</span>
		{/snippet}
		{#snippet aside()}
			{#if loaded}
				<div in:fade>
					<SceneTag class="px-6 text-3xl uppercase">
						<span class="tabular-nums">{overview.donationCount.toLocaleString('en-US')}</span>
						{overview.donationCount === 1 ? 'donation' : 'donations'}
					</SceneTag>
				</div>
			{/if}
		{/snippet}
	</SceneHeader>

	{#if !hasEvent}
		<p class="text-2xl text-ctp-red">donations: no fundraising event set in the controls</p>
	{:else if loaded}
		<!-- the total, the bar and the donation lists on the left; the milestones run the full
		     height beside them, so they have room to show at a readable size -->
		<div class="flex min-h-0 flex-1 gap-14">
			<div class="flex min-w-0 flex-1 flex-col gap-10">
				<!-- the total and the rocket bar -->
				<div class="flex flex-col gap-5" in:fade>
					<div class="flex items-end justify-between gap-12">
						<div class="flex items-baseline gap-6">
							<span
								class="text-8xl leading-none font-bold text-white tabular-nums
	                                                {settings.current.monoFont}"
							>
								{usd(raised)}
							</span>
							<span
								class="text-4xl font-semibold text-ctp-subtext0 uppercase"
								style:filter={getFiltersStyle()}>raised</span
							>
						</div>
						{#if goal}
							<div class="flex items-center gap-4">
								{#if goalReached}
									<span
										transition:fade
										class="rounded-lg bg-ctp-green px-3.5 py-1 text-2xl font-bold tracking-wider text-ctp-crust"
									>
										GOAL REACHED
									</span>
								{/if}
								<span
									class="text-4xl font-semibold text-ctp-subtext0 uppercase"
									style:filter={getFiltersStyle()}
								>
									goal
									<span class="text-white tabular-nums {settings.current.monoFont}"
										>{usd(goal)}</span
									>
								</span>
							</div>
						{/if}
					</div>

					<RocketProgressBar {overview} class="h-12" />
				</div>
				<div class="flex min-h-0 flex-1 gap-14">
					<!-- MARK: top donations -->
					<div class="flex min-w-0 flex-1 flex-col gap-4">
						<span
							class="text-2xl tracking-[0.16em] text-ctp-subtext0 uppercase"
							style:filter={getFiltersStyle()}>Top donations</span
						>
						{#if top.length}
							<ul class="flex flex-col gap-1">
								{#each top as d (d.id)}
									<li
										animate:flip={{ duration: 500, easing: cubicOut }}
										in:fade={{ duration: 400 }}
										class="flex items-center gap-5 px-3 py-2.5"
									>
										{@render donationRow(d, true)}
									</li>
								{/each}
							</ul>
						{:else}
							<p class="px-3 text-2xl text-ctp-subtext0" style:filter={getFiltersStyle()}>
								Be the first to donate!
							</p>
						{/if}
					</div>

					<!-- MARK: recent donations -->
					{#if recent.length}
						<div
							class="mt-8 max-h-108 min-h-0 flex-1 self-center overflow-hidden
                                                                {scrolling
								? 'mask-t-from-92% mask-t-to-100% mask-b-from-80% mask-b-to-100%'
								: ''}"
							bind:clientHeight={viewHeight}
						>
							<!-- two copies of the list, so the first loops back in under the second -->
							<div style:transform="translateY({-offset}px)">
								<ul class="flex flex-col gap-1 pb-1" bind:offsetHeight={copyHeight}>
									{@render recentRows()}
								</ul>
								{#if scrolling}
									<ul class="flex flex-col gap-1 pb-1" aria-hidden="true">
										{@render recentRows()}
									</ul>
								{/if}
							</div>
						</div>
					{/if}

					{#snippet recentRows()}
						{#each recent as d (d.id)}
							<li
								animate:flip={{ duration: 500, easing: cubicOut }}
								in:fly={{ x: -60, duration: 500, easing: cubicOut }}
								out:fade={{ duration: 200 }}
								class="flex items-center gap-4 px-3 py-1.5"
							>
								{@render donationRow(d)}
							</li>
						{/each}
					{/snippet}

					<!-- a donation's name, accepted message and amount -->
					{#snippet donationRow(d: Donation, large = false)}
						{@const message = d.message ? d.message : ''}
						<div class="flex min-w-0 grow flex-col">
							<span class="truncate leading-tight text-white {large ? 'text-4xl' : 'text-3xl'}">
								{d.name || 'Anonymous'}
							</span>
							{#if message}
								<span
									in:fade
									class="truncate leading-tight text-ctp-subtext0 italic {large
										? 'text-2xl'
										: 'text-xl'}"
									style:filter={getFiltersStyle()}
								>
									{message}
								</span>
							{/if}
						</div>
						<span
							class="shrink-0 font-semibold text-ctp-lavender tabular-nums
                                                        {large ? 'text-4xl' : 'text-3xl'} 
                                                        {settings.current.monoFont}"
							style:filter={getFiltersStyle()}
						>
							{usd(d.amount)}
						</span>
					{/snippet}
				</div>
			</div>

			<!-- MARK: milestones -->
			{#if milestones.length}
				<div class="flex w-[36rem] shrink-0 flex-col gap-4">
					<span
						class="text-2xl tracking-[0.16em] text-ctp-subtext0 uppercase"
						style:filter={getFiltersStyle()}>Milestones</span
					>
					<ul
						class="-mx-1 flex min-h-0 flex-1 flex-col overflow-hidden p-1"
						bind:this={milestoneList}
						bind:clientHeight={milestoneListHeight}
					>
						{#each milestones as m, i (i)}
							{@const active = i === activeIndex}
							<li
								class="relative flex items-center gap-[0.75em] rounded-[0.6em] px-[0.6em] py-[0.3em] transition-opacity duration-500"
								class:opacity-35={reached(m)}
							>
								{#if active}
									<div
										class="absolute inset-0 -z-10 rounded-[0.6em] bg-ctp-lavender/20 ring-2 ring-ctp-lavender/70"
										style:filter={getFiltersStyle()}
									></div>
								{/if}
								<span
									class="w-[4.6em] shrink-0 text-right text-[1.25em] font-semibold text-ctp-lavender tabular-nums
                                                                        {settings.current.monoFont}"
									style:filter={getFiltersStyle()}
								>
									{usd(m.goal)}
								</span>
								<span
									class="min-w-0 grow leading-snug text-white"
									class:font-bold={active}
									class:line-through={reached(m)}
								>
									{m.description}
								</span>
								{#if active}
									<span
										class="shrink-0 rounded-[0.35em] border-2 border-ctp-lavender px-[0.5em] text-[0.75em] font-bold tracking-wider text-ctp-lavender"
										style:filter={getFiltersStyle()}
									>
										NEXT
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
	<PicksStarted />
</SceneFrame>
