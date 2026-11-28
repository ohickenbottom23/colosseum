// all the numbers we'll want to tune after people play it

export const START_GLORY = 100;
export const GLORY_FLOOR = 100;

export const WIN_BASE = 50; // glory for a full stake win when you were alone against everyone (x1.2 with CROWD_MIN)
export const LOSS_BASE = 25; // glory lost on a full stake loss, half of a win
export const CROWD_MIN = 0.2; // even agreeing with everyone pays a little

export const START_TOKENS = 50; // what a brand new player gets
export const DAILY_TOKENS = 50;
export const TOKEN_CAP = 200; // daily grant won't push you past this

// "a day" is in the player's own timezone. Central time if we can't tell
export const DEFAULT_TIME_ZONE = "America/Chicago";
// you can only switch timezones once a week, so switching can't farm extra daily grants
export const TIME_ZONE_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_STAKE_FACTOR = 2; // staking over 100 doesn't keep scaling glory

export const RESOLVE_WINDOW_MS = 48 * 60 * 60 * 1000;

// disputes: anyone who picked a side can dispute a settled call for a day, then everyone
// who picked a side gets a day to vote on what really happened
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const VOTE_WINDOW_MS = 24 * 60 * 60 * 1000;

// making a call
export const MAX_CALL_TEXT = 200;
export const MAX_LABEL = 40; // like "the weather"
export const MIN_DEADLINE_MS = 10 * 60 * 1000; // at least 10 minutes out
export const MAX_DEADLINE_MS = 365 * 24 * 60 * 60 * 1000; // at most a year out

// leaderboard smoothing, pulls small samples toward 50%
export const SMOOTH_WINS = 5;
export const SMOOTH_CALLS = 10;

// arenas
export const MAX_ARENA_NAME = 30;
export const MAX_ARENA_MEMBERS = 50; // a friend group, not a stadium
export const MAX_ARENAS_PER_PLAYER = 30; // home loads every arena's calls in one query, and 30 is that query's limit

// ranks. the floor is the glory you need to reach that rank
export const RANKS = [
  { tier: 1, name: "Recruit", floor: 100 },
  { tier: 2, name: "Gladiator", floor: 150 },
  { tier: 3, name: "Centurion", floor: 250 },
  { tier: 4, name: "Champion", floor: 400 },
  { tier: 5, name: "Legend", floor: 600 },
];

// trash talk
export const MAX_COMMENT = 200;
