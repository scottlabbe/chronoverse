export type SamplePoem = {
  id: string;
  vibe: "Whimsical" | "Noir" | "Minimal" | "Wistful" | "Cosmic";
  lines: string[];
};

export const SAMPLE_POEMS: SamplePoem[] = [
  {
    id: "h1",
    vibe: "Whimsical",
    lines: [
      "At 12:22, the sun slips a denim string through the clouds, midday humming, whiskers of light tickle the grass, birds grin, mischief in their wings.",
    ],
  },
  {
    id: "n1",
    vibe: "Noir",
    lines: ["The morning fog clung to the street as the clock sneaked to 9:55, a cigarette glow in a rain-wet alley."],
  },
  {
    id: "m1",
    vibe: "Minimal",
    lines: ["The clock lunges noonward, shrugs, and in 1:51 the afternoon snaps a spark and runs."],
  },
  {
    id: "w1",
    vibe: "Wistful",
    lines: ["Evening dims the street; a bicycle hisses past at 8:27, lilac glow slipping into the window."],
  },
  {
    id: "c1",
    vibe: "Cosmic",
    lines: ["Morning yawns as suns align; at 10:41, a marigold comet seeds the sky. Space-time hums, and I ride the pulse."],
  },
];
