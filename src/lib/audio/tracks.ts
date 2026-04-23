export type BuiltInTrack = {
  id: string;
  title: string;
  url: string;
  bpm: number;
};

/** Matches `basePath` in `next.config.ts` so `/public/music/*` loads on GitHub Pages. */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const BUILT_IN_TRACKS: BuiltInTrack[] = [
  {
    id: "sweet-home-alabama",
    title: "Sweet Home Alabama",
    url: `${base}/music/Sweet_Home_Alabama_BPM88_G.mp3`,
    bpm: 97,
  },
  {
    id: "copperhead-road",
    title: "Copperhead Road",
    url: `${base}/music/Copperhead_Road_BPM82.mp3`,
    bpm: 82,
  },
];
