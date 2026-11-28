import { fundraisingState } from '$lib/storage.svelte';
import type { DonationsOverview, Donation, DonationMilestone, Subscriber } from '$lib/types.svelte';
import { deepCopy, sleep } from '$lib/util';
import { Moderation } from '../moderation/api-moderation';
import { onTestDonation } from './dwb-test-donations.svelte';
import { createRateLimitedApi } from '../rate-limited-api';

export namespace Dwb {
	//fundraisingState.current.donations = [];
	const participantEndpoint = () =>
		'/participants/' + fundraisingState.current.eventUrl.split('/').at(-1);
	const fetching = new Set<DwbModelName>();
	const fetchInterval = 16 * 1000;
	const eTags = new Map<DwbModelName, string>();
	const overviewSubscribers: Array<Subscriber<DonationsOverview>> = [];
	const donationsSubscribers: Array<Subscriber<Donation[]>> = [];
	const milestonesSubscribers: Array<Subscriber<DonationMilestone[]>> = [];

	// undefined until the first fetch, so new subscribers aren't handed a made-up $0 overview
	let overview: DonationsOverview | undefined;
	let donations: Donation[] = fundraisingState.current.donations;
	// what subscribers get: the donations above, plus any test donations (see
	// dwb-test-donations), in the order they came in. kept apart so test donations are never
	// saved or counted in the fetch offset, which would skip real donations
	let shownDonations: Donation[] = donations;
	// test donations wait for the first fetch: one landing before it would put the whole
	// history after it, so everything would look new
	let donationsFetched = false;
	let milestones: DonationMilestone[] = [];

	function overviewCopy() {
		return deepCopy(overview!);
	}

	function donationsCopy() {
		return deepCopy(shownDonations);
	}

	// TEST ONLY: fake donations go through the same conversion and moderation as fetched ones
	onTestDonation(async (dwbDonation) => {
		if (donationsSubscribers.length === 0 || !donationsFetched) return;
		const moderated = await Moderation.moderateDonations([toDonation(dwbDonation)]);
		shownDonations = shownDonations.concat(moderated);
		donationsSubscribers.forEach((s) => s.handler(donationsCopy()));
	});

	function milestonesCopy() {
		return deepCopy(milestones);
	}

	// uncached: the cloudflare adapter cached the totals and milestones (whose urls never change)
	// for hours, as DWB marks its responses cacheable for 4 hours
	const fetchDwb = createRateLimitedApi({
		baseUrl: '/api/dwb',
		defaultTimeoutSeconds: 15,
		rateLimitedPerEndpoint: true,
		cache: 'no-store'
	});

	export function subscribeToDonationsOverview(callback: (overview: DonationsOverview) => void) {
		const id = crypto.randomUUID();
		overviewSubscribers.push({
			id,
			handler: callback
		});

		if (overview) {
			callback(overviewCopy());
		}

		fetchAndSetOverview();
		return id;
	}

	export function subscribeToDonations(callback: (newDonations: Donation[]) => void) {
		const id = crypto.randomUUID();
		donationsSubscribers.push({
			id,
			handler: callback
		});

		if (donations.length > 0) {
			callback(donationsCopy());
		}

		fetchAndSetDonations();
		return id;
	}

	export function subscribeToMilestones(callback: (milestones: DonationMilestone[]) => void) {
		const id = crypto.randomUUID();
		milestonesSubscribers.push({
			id,
			handler: callback
		});

		if (milestones.length > 0) {
			callback(milestonesCopy());
		}

		fetchAndSetMilestones();
		return id;
	}

	export function unsubscribeFromDonationsOverview(id: string) {
		removeById(overviewSubscribers, id);
	}

	export function unsubscribeFromDonations(id: string) {
		removeById(donationsSubscribers, id);
	}

	export function unsubscribeFromMilestones(id: string) {
		removeById(milestonesSubscribers, id);
	}

	async function fetchAndSetOverview() {
		let lastETag = '';
		fetchEndpointInLoop<DwbParticipantOverview>({
			endpoint: () => participantEndpoint(),
			modelName: 'overview',
			fetchUntil: () => overviewSubscribers.length > 0,
			callback: (dwbOverview) => {
				const eTag = eTags.get('overview');
				if (!eTag || eTag === lastETag) return;

				overview = {
					goal: dwbOverview.fundraisingGoal,
					raised: dwbOverview.sumDonations,
					donationCount: dwbOverview.numDonations
				};

				overviewSubscribers.forEach((s) => s.handler(overviewCopy()));
				lastETag = eTag;
			}
		});
	}

	async function fetchAndSetDonations() {
		let lastETag = '';
		fetchEndpointInLoop<DwbDonation[]>({
			endpoint: () =>
				`${participantEndpoint()}/donations?offset=${donations.length}&orderBy=createdDateUTC%20ASC`,
			modelName: 'donations',
			fetchUntil: () => donationsSubscribers.length > 0,
			// dwb answers 204 when there's nothing new, which skips the callback
			onAnswered: () => (donationsFetched = true),
			callback: async (dwbDonations) => {
				const eTag = eTags.get('donations');
				if (!eTag || eTag === lastETag) return;

				const newDonations = dwbDonations.map(toDonation);

				if (newDonations.length === 0) return;

				const newDonationIds = newDonations.map((d) => d.id);
				const moderatedDonations = await Moderation.moderateDonations(newDonations);
				donations = donations
					.filter((d) => !newDonationIds.includes(d.id))
					.concat(moderatedDonations);
				shownDonations = shownDonations
					.filter((d) => !newDonationIds.includes(d.id))
					.concat(moderatedDonations);

				fundraisingState.current.donations = donations;
				donationsSubscribers.forEach((s) => s.handler(donationsCopy()));
				lastETag = eTag;
			}
		});
	}

	async function fetchAndSetMilestones() {
		let lastETag = '';
		fetchEndpointInLoop<DwbMilestone[]>({
			endpoint: () => participantEndpoint() + '/milestones',
			modelName: 'milestones',
			fetchUntil: () => milestonesSubscribers.length > 0,
			callback: (dwbMilestones) => {
				const eTag = eTags.get('milestones');
				if (!eTag || eTag === lastETag) return;

				milestones = dwbMilestones.map((m) => ({
					goal: m.fundraisingGoal,
					description: m.description,
					isActive: m.isActive,
					isComplete: m.isComplete
				}));

				if (milestones.length === 0) return;

				milestonesSubscribers.forEach((s) => s.handler(milestonesCopy()));
				lastETag = eTag;
			}
		});
	}

	async function fetchEndpointInLoop<TDwbModel>({
		endpoint,
		modelName,
		fetchUntil,
		onAnswered,
		callback
	}: {
		endpoint: () => string;
		modelName: DwbModelName;
		fetchUntil: () => boolean;
		// after any successful answer, new data or not (200, 204 or 304)
		onAnswered?: () => void;
		callback: (result: TDwbModel) => void | Promise<void>;
	}) {
		if (fetching.has(modelName)) {
			return;
		}

		fetching.add(modelName);
		while (fetchUntil()) {
			// no event set (it was cleared in the controls): wait for one instead of fetching
			// a participant with no id
			if (!fundraisingState.current.eventUrl) {
				await sleep(fetchInterval);
				continue;
			}
			try {
				const resp = await fetchDwb(endpoint(), eTags.get(modelName));
				if (resp.status === 304 || resp.status === 204) {
					onAnswered?.();
					await sleep(fetchInterval);
					continue;
				}

				const eTag = resp.headers.get('ETag');
				if (eTag) {
					eTags.set(modelName, eTag);
				}

				const result = (await resp.json()) as TDwbModel;
				await callback(result);
				if (resp.ok) onAnswered?.();
			} catch (err) {
				console.error(`dwb: fetching ${modelName} failed`, err);
			}

			await sleep(fetchInterval);
		}

		fetching.delete(modelName);
	}

	function toDonation(d: DwbDonation): Donation {
		return {
			id: d.donationID,
			name: d.displayName,
			amount: d.amount,
			message: d.message,
			createdAt: d.createdDateUTC
		};
	}

	function removeById(arr: { id: string }[], id: string) {
		const idx = arr.findIndex((i) => i.id === id);
		if (idx > -1) {
			arr.splice(idx, 1);
		}
	}

	type DwbModelName = 'overview' | 'donations' | 'milestones';

	type DwbParticipantOverview = {
		fundraisingGoal: number;
		sumDonations: number;
		numDonations: number;
	};

	export type DwbDonation = {
		donationID: string;
		displayName: string;
		message: string;
		createdDateUTC: string;
		amount: number;
	};

	type DwbMilestone = {
		fundraisingGoal: number;
		description: string;
		isActive: boolean;
		isComplete: boolean;
	};
}
