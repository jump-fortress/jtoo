// TEST ONLY: fake donations, in DWB's own api format, for testing everything donations drive
// (moderation, the overlay's donation cards, RTD) without real donations. they skip DWB's api,
// so they don't test fetching or caching it.
//
// the controls make them up and broadcast them to every open page (the overlay in OBS too, when
// it runs in the same browser), where Dwb puts them through the same conversion and moderation
// as fetched donations. they're kept apart from the saved ones, so they're gone after a reload.

import { rtdEffects } from '$lib/websockets/jf-rtd/jf-rtd.svelte';
import type { Dwb } from './api-dwb';

type DwbDonation = Dwb.DwbDonation;

// set to false before going live: hides the checkbox and ignores any broadcast fake donations
export const TEST_DONATIONS_ALLOWED = false;

// a fake donation comes in every 0 to this many ms
const MAX_GAP_MS = 30_000;
const CHANNEL = 'dwbTestDonations';

// the controls' checkbox. not saved, so a reload always turns it off
export const testDonations = $state({ enabled: false });

const names = ['Test Donor', 'jumper', 'Anonymous Soldier', 'rocket enjoyer', 'speedrun fan'];
const messages = [
	(e: string) => `rtd ${e}`,
	(e: string) => `rtd: ${e}`,
	(e: string) => `good luck everyone! rtd ${e}`,
	(e: string) => `RTD ${e.toUpperCase()}`
];

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]!;

function makeDonation(): DwbDonation {
	return {
		donationID: 'test-' + crypto.randomUUID(),
		displayName: pick(names),
		message: pick(messages)(pick(rtdEffects)),
		createdDateUTC: new Date().toISOString(),
		// $10-45, so some are under the $20 that rolls an RTD effect, and don't
		amount: 10 + Math.floor(Math.random() * 6) * 7
	};
}

/** Sends a fake donation to every page every 0-30s, until the returned function is called. */
export function startTestDonations(): () => void {
	const channel = new BroadcastChannel(CHANNEL);
	let timer: ReturnType<typeof setTimeout>;
	const schedule = () => {
		timer = setTimeout(() => {
			const donation = makeDonation();
			console.log('test donation:', donation);
			channel.postMessage(donation);
			schedule();
		}, Math.random() * MAX_GAP_MS);
	};
	schedule();
	return () => {
		clearTimeout(timer);
		channel.close();
	};
}

/**
 * Calls back with each fake donation sent from any page, this one included (a BroadcastChannel
 * doesn't hear its own messages, but the sender uses a channel of its own).
 */
export function onTestDonation(callback: (donation: DwbDonation) => void) {
	if (!TEST_DONATIONS_ALLOWED || typeof BroadcastChannel === 'undefined') return;
	new BroadcastChannel(CHANNEL).onmessage = (e) => callback(e.data as DwbDonation);
}
