import { Dwb } from '$lib/api/dwb/api-dwb';
import { gameServerToken, updateGameServerStatus } from '$lib/game-server.svelte';
import { fundraisingState, settings } from '$lib/storage.svelte';
import { rtdEffects } from '$lib/websockets/jf-rtd/jf-rtd.svelte';
import type { Donation } from '$lib/types.svelte';

// donations of at least this much roll an RTD effect
const RTD_AMOUNT = 20;

/**
 * Sends an RTD effect to the game for each new donation of $20 or more: the one the message
 * asks for ('rtd snail'), or a random one. Run it in one place only (the controls), or a
 * donation could fire twice. Returns a function that stops it.
 */
export function watchRtdDonations(): () => void {
	// fundraisingState.current.lastDonationProcessedByRtdId = '';
	const startedAt = Date.now();
	let latestDonations: Donation[] = [];
	let processing = false;
	let stopped = false;

	const donationsSubId = Dwb.subscribeToDonations((donations) => {
		// donations.at(-2)!.message = 'rtd: snail';
		// donations.at(-2)!.amount = 30;
		// donations.at(-2)!.createdAt = new Date(startedAt).toISOString();
		//
		// donations.at(-1)!.message = 'rtd: funnyfeeling';
		// donations.at(-1)!.amount = 30;
		// donations.at(-1)!.createdAt = new Date(startedAt).toISOString();
		// console.log(donations);
		latestDonations = donations;
		processNewDonations();
	});

	/**
	 * Sends the effects of new donations in order, one request at a time. Only one loop runs:
	 * donations that arrive while it's sending are picked up by it, not by a second loop that
	 * would send the same effects again.
	 */
	async function processNewDonations() {
		if (processing) return;
		processing = true;
		try {
			let pending = unprocessed(latestDonations);
			while (pending.length > 0) {
				for (const d of pending) {
					// console.log(d);
					// a restarted watcher has its own loop
					if (stopped) return;
					// marked before sending, so a donation never fires twice
					fundraisingState.current.lastDonationProcessedByRtdId = d.id;
					const effect = rtdEffectFor(d);
					if (effect) await sendRtdEffect(effect);
				}
				// donations that came in while effects were being sent
				pending = unprocessed(latestDonations);
			}
		} finally {
			processing = false;
		}
	}

	function unprocessed(donations: Donation[]): Donation[] {
		let idx = donations.findIndex(
			(d) => d.id === fundraisingState.current.lastDonationProcessedByRtdId
		);
		if (idx === -1) {
			// no record of what was processed (rtd just enabled, a new event or cleared storage):
			// treat donations from before this started as processed, so old ones don't fire again.
			// the list is oldest first; a donation without a valid date counts as old
			idx = donations.findLastIndex((d) => !(Date.parse(d.createdAt ?? '') >= startedAt));
			// saved straight away, so later updates match by id instead of by date
			if (idx > -1) fundraisingState.current.lastDonationProcessedByRtdId = donations[idx].id;
		}
		return donations.slice(idx + 1);
	}

	return () => {
		stopped = true;
		Dwb.unsubscribeFromDonations(donationsSubId);
	};
}

function rtdEffectFor(d: Donation): string | undefined {
	if (d.amount < RTD_AMOUNT) return undefined;
	const message = d.message?.toLowerCase();
	return (
		rtdEffects.find((e) => message?.includes('rtd ' + e) || message?.includes('rtd: ' + e)) ??
		rtdEffects[Math.floor(Math.random() * rtdEffects.length)]
	);
}

async function sendRtdEffect(effect: string) {
	try {
		// none picked: every server
		const targets = settings.current.rtdTargetServers.join(',');
		const resp = await fetch(
			`/api/rtd/${effect}?token=${gameServerToken()}&targets=${encodeURIComponent(targets)}`
		);
		await updateGameServerStatus(resp.clone());
		if (resp.status !== 204) {
			console.error(await resp.text());
		}
	} catch (e) {
		// one failed request shouldn't stop the donations after it
		console.error(`rtd: sending ${effect} failed`, e);
	}
}
