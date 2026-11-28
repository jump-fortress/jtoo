import { rtdEffects } from '$lib/websockets/jf-rtd/jf-rtd.svelte';
import type { Donation } from '$lib/types.svelte';

// donations of at least this much roll an RTD effect
export const RTD_AMOUNT = 20;

/**
 * The RTD effect a donation rolls, if it's enough for one: the one its message asks for
 * ('rtd snail' or 'rtd: snail'), or one picked from its id. picked from the id rather than at
 * random, so the controls (which send it) and the overlay (which shows it) get the same effect
 * without having to talk to each other.
 */
export function rtdEffectFor(d: Donation): { effect: string; requested: boolean } | undefined {
	if (d.amount < RTD_AMOUNT) return undefined;
	const message = d.message?.toLowerCase();
	const requested = rtdEffects.find(
		(e) => message?.includes('rtd ' + e) || message?.includes('rtd: ' + e)
	);
	if (requested) return { effect: requested, requested: true };
	return { effect: rtdEffects[hash(d.id) % rtdEffects.length]!, requested: false };
}

// FNV-1a: spreads similar ids (eg: ones differing in a character) across the effects
function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

const labels: Record<string, string> = {
	funnyfeeling: 'Funny Feeling',
	fasthands: 'Fast Hands',
	stronggravity: 'Strong Gravity',
	lowgravity: 'Low Gravity',
	tinymann: 'Tiny Mann',
	infinitejump: 'Infinite Jump',
	increasedspeed: 'Increased Speed',
	drunkwalk: 'Drunk Walk'
};

/** An effect's name for the overlay, eg: 'Funny Feeling' for 'funnyfeeling'. */
export function rtdEffectLabel(effect: string): string {
	return labels[effect] ?? effect.charAt(0).toUpperCase() + effect.slice(1);
}
