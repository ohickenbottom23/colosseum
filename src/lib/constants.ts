// all the numbers we'll want to tune after people play it

export const START_GLORY = 100;
export const GLORY_FLOOR = 100;

export const WIN_BASE = 10; // glory for a full stake win when you were alone against everyone
export const LOSS_BASE = 5; // glory lost on a full stake loss, half of a win
export const CROWD_MIN = 0.2; // even agreeing with everyone pays a little

export const START_TOKENS = 50; // what a brand new player gets
export const DAILY_TOKENS = 50;
export const TOKEN_CAP = 200; // daily grant won't push you past this
export const MAX_STAKE_FACTOR = 2; // staking over 100 doesn't keep scaling glory

export const RESOLVE_WINDOW_MS = 48 * 60 * 60 * 1000;

// making a call
export const MAX_CALL_TEXT = 200;
export const MAX_LABEL = 40; // like "the weather"
export const MIN_DEADLINE_MS = 10 * 60 * 1000; // at least 10 minutes out
export const MAX_DEADLINE_MS = 365 * 24 * 60 * 60 * 1000; // at most a year out

// leaderboard smoothing, pulls small samples toward 50%
export const SMOOTH_WINS = 5;
export const SMOOTH_CALLS = 10;
