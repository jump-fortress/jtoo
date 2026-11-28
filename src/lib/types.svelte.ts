import { v4 as uuidv4 } from 'uuid';
import { type Games, type MatchBestOfs, type Results } from './Bracket.svelte';
import type { Tempus2 } from './api/tempus2/api-tempus2';

// MARK: Types
export type Seconds = number;
export type Centiseconds = number;
export type TempusID = number;
export const TFClasses = ['demoman', 'soldier', 'overall'] as const;
export type TFClass = (typeof TFClasses)[number];

export type Rank = { points: number; rank: number; title: string | null };

export const Divisions = ['wood', 'steel', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
export type Division = (typeof Divisions)[number];

export type SteamID3 = number;
export type MapFileName = string;

export class Player {
	name: string = '';
	division: Division | null = null;
	tempusID: number | undefined = undefined;
	steamID3: number = 0;
	steamID: string = '';
	avatarURL: string = '';
	tag: string = '';
	flag: string = '';
	pr: string = ''; // only used for manual PRs
	rank: Record<TFClass, Rank> | undefined = undefined;
	TTs: Record<TFClass, number> | undefined = undefined;
	WRs: Record<TFClass, number> | undefined = undefined;
	tempusFetchedAt: number = 0; // when rank, TTs and WRs were last fetched; 0 is never
	bestRun: string = '';
	note: string = '';
	favouriteMap: string = '';
}

export type MapRun = {
	tempusID: number;
	rank: number;
	duration: Seconds;
};

export class TFMap {
	fileName: MapFileName = '';
	shortName: string = '';
	mapZoneId: number = 0;
	intendedClass: Record<Exclude<TFClass, 'overall'>, boolean> = { soldier: false, demoman: false };
	tier: Record<Exclude<TFClass, 'overall'>, number> = { soldier: 0, demoman: 0 };
	authors: Tempus2.Author[] = [];
	worldRecordInfo: Record<Exclude<TFClass, 'overall'>, Tempus2.Run2 | undefined> = {
		soldier: undefined,
		demoman: undefined
	};
	runs: Omit<Record<TFClass, MapRun[]>, 'overall'> = { soldier: [], demoman: [] };
	// when the pool import last fetched runs, and the tempus ids it kept them for
	runsFetchedAt: number = 0;
	runsFetchedFor: TempusID[] = [];

	imageURL?: string = '';

	static fileNameToShortName(fileName: string): string {
		if (fileName == 'jump_') return fileName;

		// bunny hop maps keep their 'bb_' prefix, as the name alone is just 'bb', eg: 'bb_initiate'
		// from 'jump_bb_initiate_b3'
		const bb = fileName.match(/^jump_bb_([^_]+)/);
		if (bb) return `bb_${bb[1].trim()}`;

		const tmp = fileName.match(/(?<=_)[^_]+/); // match name after first '_' and before any subsequent '_', eg: 'beef' from 'jump_beef' or 'jump_beef_final'
		return tmp ? tmp[0].trim() : '';
	}

	/**
	 * Whether a map's short name comes from a rule added after maps were first saved, so saved
	 * maps are given it again (see the pool import).
	 */
	static hasOwnShortNameRule(fileName: string): boolean {
		return fileName.startsWith('jump_bb_');
	}

	static fileNameToTfId(fileName: string): string {
		return fileName.replace('_', '-');
	}
}

export const nullPlayer: Player = Object.freeze(new Player());

export const BracketOptions = ['whole', 'upper', 'lower'] as const;
export type BracketOption = (typeof BracketOptions)[number];

// a single or double elimination bracket, made on its own from JTOO's players
export const BracketSizes = [4, 8, 10] as const;
export type BracketSize = (typeof BracketSizes)[number];
export const Eliminations = ['double', 'single'] as const;
export type Elimination = (typeof Eliminations)[number];

// how many games each match is played over; the first to win most of them wins the match
export const BestOfs = [1, 3, 5] as const;
export type BestOf = (typeof BestOfs)[number];

export type SavedBracket = {
	id: string;
	name: string;
	size: BracketSize;
	elimination?: Elimination; // double when missing, as brackets saved before it were
	// matches changed from their format's best of (see Bracket.svelte.ts), eg: a best of 5 semi
	bestOfs?: MatchBestOfs;
	players: SteamID3[]; // seeding order: seed 1 first
	results: Results;
	games?: Games;
};

export function newBracket(): SavedBracket {
	return {
		id: uuidv4(),
		name: '',
		size: 8,
		elimination: 'double',
		players: [],
		results: {},
		games: {}
	};
}

// MARK: Settings
export const Fonts = [
	'font-inter',
	'font-montserrat',
	'font-roboto',
	'font-space-grotesk',
	'font-geist',
	'font-lexend-deca',
	'font-manrope',
	'font-nunito-sans',
	'font-outfit'
] as const;
export type Font = (typeof Fonts)[number];

export const MonoFonts = [
	'font-dm-mono',
	'font-anonymous-pro',
	'font-ubuntu-mono',
	'font-azeret-mono',
	'font-chivo-mono',
	'font-spline-sans-mono'
] as const;
export type MonoFont = (typeof MonoFonts)[number];

export const OverlayScenes = [
	'',
	'DualPovMatchScene',
	'SinglePovMatchScene',
	'TournamentInfoScene',
	'ScheduleScene',
	'DonationsScene',
	'MapScene',
	'LeaderboardScene',
	'BracketScene',
	'PlayerCardScene',
	'PlayerListScene',
	'ThanksScene'
] as const;
// these weren't updated with the last big changes due to time constraints and relevance to the event format
export const BrokenOverlayScenes = [
	'TournamentInfoScene',
	// 'PlayerCardScene', // currently unable to fetch tempus data via only steam id, so this scene looks broken
	'ThanksScene'
];
export type OverlayScene = (typeof OverlayScenes)[number];
// match scenes are built around the players' POVs, so they make no sense over the Idle scene
export const MatchOverlayScenes = ['DualPovMatchScene', 'SinglePovMatchScene'] as const;
export type IdleOverlayScene = Exclude<OverlayScene, (typeof MatchOverlayScenes)[number]>;
export const IdleOverlayScenes = OverlayScenes.filter(
	(s): s is IdleOverlayScene =>
		!(MatchOverlayScenes as readonly string[]).includes(s) && !BrokenOverlayScenes.includes(s)
);

export type Settings = {
	font: Font;
	monoFont: MonoFont;
	hue: number;
	saturation: number;
	enableMovingBG: boolean;
	enablePRs: boolean;
	enableAvatars: boolean;
	enableTags: boolean;
	enableFlags: boolean;
	enableStage: boolean; // the stage above the map on the match scene's round tab
	enableGradient: boolean;
	enableTeamColors: boolean;
	enablePOVGuide: boolean;
	enableFundraisingDonations: boolean;
	enableFundraisingRtd: boolean;
	useShortMapNames: boolean;
	overlayScene: OverlayScene;
	idleObsScene: string; // name of the broadcaster's OBS Idle scene
	idleOverlayScene: IdleOverlayScene; // shown, without backgrounds, while OBS is on the Idle scene
	ksnWebSocketToken: string;
	consoleBaseUrl: string; // console host for the live feeds and the raw websocket
	followConsoleStageMap: boolean; // set the stage and map labels from the console's race
	followRacePlayers: boolean; // player lists show the race's players in leaderboard order
	selectDuelPlayers: boolean; // a duel race or picks and bans session selects its players as player A and B
	useDummyData: boolean; // show made-up race and tournament data instead of the console's
	timerDelayMs: number; // the overlay shows race updates this late, to match the in-game spectator
	playerSwitchDelayMs: number; // the overlay switches players this late, to match the in-game spectator
	tfClass: Exclude<TFClass, 'overall'>; // the class shown on player cards and lists
	scheduleDay: number; // index into scheduleDays, the sheet tab the schedule scene reads
	jfRelayWebSocketToken: string;
	jfGameServerToken: string; // the game server's console token, which RTD effects are sent with
	rtdTargetServers: string[]; // server tags (eg: AU-SYD1) RTD effects go to. empty: every server
	logWsMessages: boolean;
	obsWsIp: string;
	obsWsPort: number | undefined;
	obsWsPw: string;
	fundraisingShowDonationSeconds: number;
};

// the tournament's standings so far, one round's results (its roundIndex), or the final podium
export type LeaderboardView = 'standings' | 'final' | number;

export type Overlay = {
	players: Array<SteamID3 | undefined>;
	map: MapFileName;
	stage: string;
	tournament: string; // console tournament id the leaderboard shows; '' follows the race
	leaderboardView: LeaderboardView; // which board the leaderboard scene shows
	bracket: string; // id of the bracket the bracket scene shows
	// a match picked as live by middle clicking it on the bracket scene (null: none is live),
	// in place of the one the console's race is for. Cleared when the next bracket race starts
	bracketLive?: { bracket: string; match: string | null };
	// a match deselected in the controls: its score isn't shown for its players, until it's made
	// live again or the next race for it starts
	bracketDeselected?: { bracket: string; match: string };
	// what last selected player A and B automatically, eg: 'race 12' or 'picks <id>', so the
	// controls tell the relay again even when it selected the players already selected
	autoSelectedBy?: string;
	// console time of the last 'clear timers'; runs and race windows that started earlier are hidden
	timersClearedAt?: number;
	// console time of the last 'clear mini leaderboard'; a race that started earlier isn't listed
	miniLeaderboardClearedAt?: number;
	// time of the controls' last schedule refresh; the overlay re-fetches the sheet when it changes
	scheduleRefreshedAt?: number;
};

// the event's players and maps, imported from a console player pool and map pool
export type Pool = {
	players: SteamID3[];
	maps: MapFileName[];
	playerPoolName?: string;
	mapPoolName?: string;
};

export type Items = {
	players: Player[];
	maps: TFMap[];
	stages: string[];
	brackets: SavedBracket[];
};

export type Subscriber<T> = {
	id: string;
	handler: (item: T) => void;
};

export type DonationsOverview = {
	goal: number;
	raised: number;
	donationCount: number;
};

export type Donation = {
	id: string;
	name?: string;
	amount: number;
	message?: string;
	createdAt: string;
};

export type DonationMilestone = {
	goal: number;
	description: string;
	isActive: boolean;
	isComplete: boolean;
};

export type FundraisingState = {
	eventUrl: string;
	lastDonationProcessedByDonationsId: string;
	lastDonationProcessedByMessagesId: string;
	donations: Donation[];
	displayedDonations: Donation[];
	stage: number;
	animationStage: number;
	sumGoal: number;
	progressBar: {
		raised: number;
		sumRaised: number;
	};
};
