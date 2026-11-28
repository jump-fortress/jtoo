import { PersistentState } from '@friendofsvelte/state';
import {
	type Items,
	type Overlay,
	type Pool,
	type Settings,
	Player,
	type SteamID3,
	TFMap,
	type TempusID,
	type FundraisingState
} from './types.svelte';
import { addPlayersFromSteamID3, getMap, getPlayer } from './util';
import { Tempus2 } from './api/tempus2/api-tempus2';
import { Steam } from './api/steam/api-steam';
import { TempusPlaza } from './api/tempusplaza/api-tempusplaza';
import type { KSN } from './websockets/ksn/ws-ksn-types.svelte';

export const defaultStages: Array<string> = [
	'',
	'Round 1',
	'Round 2',
	'Quarterfinals',
	'Semifinals',
	'Finals',
	'Grand Finals',
	"Loser's Quarters",
	"Loser's Semis",
	"Loser's Finals"
];

export const defaultSettings: Settings = {
	font: 'font-geist',
	monoFont: 'font-azeret-mono',
	hue: 0,
	saturation: 100,
	enableMovingBG: true,
	enablePRs: true,
	enableAvatars: true,
	enableTags: false,
	enableFlags: false,
	enableStage: true,
	enableGradient: true,
	enableTeamColors: true,
	enablePOVGuide: false,
	enableFundraisingDonations: true,
	enableFundraisingRtd: false,
	useShortMapNames: true,
	ksnWebSocketToken: '',
	consoleBaseUrl: 'https://console.jumpfortress.tf',
	followConsoleStageMap: true,
	followRacePlayers: true,
	selectDuelPlayers: true,
	useDummyData: false,
	// the in-game spectator shows timer events ~150ms after the console sends them, and takes
	// ~380ms to switch players
	timerDelayMs: 150,
	playerSwitchDelayMs: 380,
	tfClass: 'soldier',
	scheduleDay: 0,
	jfRelayWebSocketToken: '',
	jfGameServerToken: '',
	rtdTargetServers: [],
	logWsMessages: false,
	overlayScene: 'DualPovMatchScene',
	idleObsScene: 'Idle',
	idleOverlayScene: '',
	obsWsIp: '',
	obsWsPort: undefined,
	obsWsPw: '',
	fundraisingShowDonationSeconds: 5
};

export const defaultOverlay: Overlay = {
	players: [undefined, undefined, undefined, undefined],
	map: '',
	stage: '',
	tournament: '',
	leaderboardView: 'standings',
	bracket: ''
};

export const defaultItems: Items = {
	players: [new Player()],
	maps: [new TFMap()],
	stages: defaultStages,
	brackets: []
};

export const defaultFundraisingState: FundraisingState = {
	eventUrl: 'https://events.doctorswithoutborders.org/campaigns/Jump-Fortress-DWB-event',
	lastDonationProcessedByDonationsId: '',
	lastDonationProcessedByMessagesId: '',
	lastDonationProcessedByRtdId: '',
	donations: [],
	displayedDonations: [],
	stage: 0,
	animationStage: 0,
	sumGoal: 0,
	progressBar: {
		raised: 0,
		sumRaised: 0
	}
};

// PersistentState only uses its defaults when nothing is saved yet, so a key added to the
// defaults after a browser saved its copy would stay undefined there. fill those in on load,
// writing only when something is missing so other tabs aren't sent a needless storage event
function addMissingDefaults<T extends object>(state: PersistentState<T>, defaults: T) {
	if (typeof localStorage === 'undefined') return;
	const saved = state.current;
	if (Object.keys(defaults).every((k) => k in saved)) return;
	state.current = { ...defaults, ...saved };
}

// overlay settings
export const settings = new PersistentState('settings', defaultSettings, 'localStorage');

// overlay state
export const overlay = new PersistentState('overlay', defaultOverlay);

/**
 * Selects player A and B automatically (eg: at the start of a duel race), noting what selected
 * them so the controls tell the relay even when they're already selected. One write, so the
 * controls see the players and what selected them together, and send the relay one message.
 */
export function autoSelectPlayers(a: SteamID3, b: SteamID3, by: string) {
	const current = overlay.current;
	const players = [...current.players];
	players[0] = a;
	players[1] = b;
	overlay.current = { ...current, players, autoSelectedBy: by };
}

// overlay items
export const items = new PersistentState('items', defaultItems);

// the event's players and maps, imported from console pools
export const pool = new PersistentState<Pool>('pool', { players: [], maps: [] });

// ws messages
export const wsMessages: PersistentState<any[]> = new PersistentState('wsMessages', []);

// OBS's live (program) scene as reported by the controls' obs-websocket connection, with when it
// was reported. the overlay prefers it to its browser source's own scene events, which can miss
// a switch (and can't be asked for the scene below the 'read user information' permission)
export const obsProgramScene = new PersistentState<{ name: string; at: number }>(
	'obsProgramScene',
	{ name: '', at: 0 },
	'localStorage'
);

// the last pick & ban session the overlay received, so the controls can bring it back after a
// reconnect, an overlay refresh or a clear wipes it
export const lastPickSession = new PersistentState<KSN.PickBansSessionStateEvent['session']>(
	'lastPickSession',
	null,
	'localStorage'
);

// whether the overlay is showing lastPickSession, so a reloaded overlay shows it again. a clear
// or a cancelled session takes it off air
export const pickSessionOnAir = new PersistentState<boolean>(
	'pickSessionOnAir',
	false,
	'localStorage'
);

export const fundraisingState = new PersistentState(
	'fundraisingState',
	defaultFundraisingState,
	'localStorage'
);

addMissingDefaults(settings, defaultSettings);
addMissingDefaults(overlay, defaultOverlay);
addMissingDefaults(fundraisingState, defaultFundraisingState);

// the settings that only change how the overlay looks and behaves (the controls' overlay visuals
// and fundraising settings); tokens, connections, scenes and automation are left alone
const visualSettingKeys = [
	'font',
	'monoFont',
	'hue',
	'saturation',
	'enableFlags',
	'enableStage',
	'enableMovingBG',
	'useShortMapNames',
	'enablePOVGuide',
	'enableGradient',
	'enableTeamColors',
	'enablePRs',
	'enableAvatars',
	'enableTags',
	'enableFundraisingRtd',
	'enableFundraisingDonations',
	'fundraisingShowDonationSeconds'
] as const satisfies ReadonlyArray<keyof Settings>;

export function resetVisualSettings() {
	const visualDefaults = Object.fromEntries(visualSettingKeys.map((k) => [k, defaultSettings[k]]));
	settings.current = { ...settings.current, ...visualDefaults };
}

/**
 * Puts everything this site saves back to how a fresh browser starts: every setting (tokens and
 * connections too), the overlay's state, players, maps and fundraising, then reloads the page.
 */
export function hardReset() {
	// set to the defaults first, so other open pages (the overlay in OBS) get them through their
	// storage events; clearing storage on its own leaves their copies in memory as they were
	settings.current = structuredClone(defaultSettings);
	overlay.current = structuredClone(defaultOverlay);
	items.current = structuredClone(defaultItems);
	pool.current = { players: [], maps: [] };
	wsMessages.current = [];
	obsProgramScene.current = { name: '', at: 0 };
	fundraisingState.current = structuredClone(defaultFundraisingState);
	// then anything else saved, e.g. which accordions are open
	localStorage.clear();
	sessionStorage.clear();
	location.reload();
}
