<script lang="ts">
	import { TEST_DONATIONS_ALLOWED, testDonations } from '$lib/api/dwb/dwb-test-donations.svelte';
	import { defaultFundraisingState, fundraisingState, settings } from '$lib/storage.svelte';
	import type { FeedState } from '$lib/websockets/console/console-live.svelte';
	import Checkbox from './Checkbox.svelte';
	import ConfirmButton from './ConfirmButton.svelte';
	import ConnectionPanel from './ConnectionPanel.svelte';
	import type { Snippet } from 'svelte';

	// the fundraising event, in the controls' status bar like the connections. anything else to
	// show under its status (eg: RTD) comes in as children
	let { children }: { children?: Snippet } = $props();

	const dwbUrlPrefix = 'https://events.doctorswithoutborders.org/';
	// fundraisingState changes all the time (donations, the progress bar), so the saved url gets
	// its own derived: the input below only resets when the url itself changes, not mid-typing
	const savedUrl = $derived(fundraisingState.current.eventUrl);
	let url = $derived(savedUrl);
	let fetching = $state(false);
	let invalidUrl = $state(false);

	// 'connected' once an event is set: the overlay fetches its donations
	const eventState: FeedState = $derived(
		fetching ? 'connecting' : savedUrl && !invalidUrl ? 'open' : 'closed'
	);

	// a fresh fundraising state for the given event, or none: a copy, so later changes don't
	// write into the defaults
	function resetFundraising(eventUrl: string) {
		fundraisingState.current = { ...structuredClone(defaultFundraisingState), eventUrl };
	}

	// no event hides the overlay's fundraising section and stops fetching donations
	function clearEvent() {
		invalidUrl = false;
		resetFundraising('');
	}

	async function onSearch() {
		// an emptied field clears the event, the same as the clear button
		if (!url.trim()) {
			clearEvent();
			return;
		}

		if (!url.startsWith(dwbUrlPrefix)) {
			invalidUrl = true;
			return;
		}

		fetching = true;
		try {
			const resp = await fetch(`/api/dwb/participants/${url.split('/').at(-1)}`);
			invalidUrl = resp.status === 404;
			if (!invalidUrl) resetFundraising(url);
		} finally {
			fetching = false;
		}
	}
</script>

<ConnectionPanel
	label="url"
	id="input-fundraising-url"
	type="text"
	placeholder={dwbUrlPrefix}
	submitLabel="fetch"
	bind:value={url}
	onconnect={onSearch}
	state={eventState}
	error={invalidUrl ? "that isn't a DWB event url" : undefined}
>
	{@render children?.()}

	{#snippet advanced()}
		<Checkbox desc="iterate fundraising donations" setting="enableFundraisingDonations" />
		<label>
			<input
				type="number"
				min="0"
				class="remove-arrow w-7 input accent-ctp-lavender"
				bind:value={settings.current.fundraisingShowDonationSeconds}
			/>
			<span>seconds to show each donation for</span>
		</label>
		{#if TEST_DONATIONS_ALLOWED}
			<!-- TEST ONLY. not a saved setting, so a reload always turns it off -->
			<label>
				<input
					class="peer size-4 accent-ctp-lavender"
					type="checkbox"
					bind:checked={testDonations.enabled}
				/>
				<span class="peer-not-checked:text-ctp-overlay2">
					test donations: a fake donation with a random RTD effect every 0-30s
				</span>
			</label>
		{/if}
	{/snippet}
</ConnectionPanel>
