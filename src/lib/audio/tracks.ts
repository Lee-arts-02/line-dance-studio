export type BuiltInTrack = {
  id: string;
  title: string;
  url: string;
  bpm: number;
};

export const BUILT_IN_TRACKS: BuiltInTrack[] = [
  {
    id: "sweet-home-alabama",
    title: "Sweet Home Alabama",
    url: "/music/Sweet_Home_Alabama_BPM88_G.mp3",
    bpm: 88,
  },
  {
    id: "copperhead-road",
    title: "Copperhead Road",
    url: "/music/Copperhead_Road_BPM82.mp3",
    bpm: 82,
  },
];
