import type { SavedBracket } from './types.svelte';

// TEMPORARY: the finished RJR Playoffs bracket (2026-11-27), loaded by default so the bracket
// scene can show it. Remove this file and its uses in storage.svelte.ts after the event.
export const rjrPlayoffs: SavedBracket = {
	id: 'a801a53f-fb69-4942-9fc1-c2675b75c534',
	name: 'RJR Playoffs',
	size: 10,
	elimination: 'single',
	players: [
		1283135081, 406102720, 241719671, 97170957, 858268216, 55778347, 192454142, 186955417,
		104903957, 141459877
	],
	results: {
		PI1: 186955417,
		QF1: 1283135081,
		PI2: 192454142,
		QF3: 406102720,
		QF2: 97170957,
		QF4: 241719671,
		SF2: 241719671,
		SF1: 97170957,
		F: 241719671
	},
	games: {},
	bestOfs: {}
};
