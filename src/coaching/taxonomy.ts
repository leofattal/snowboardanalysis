/**
 * Fixed fault taxonomy (PRD §7). The LLM may ONLY pick faults from this list —
 * it prioritizes and explains, it does not invent. The mock coach uses the
 * same copy so behavior is consistent offline.
 */
export interface FaultDef {
  id: string;
  name: string;
  /** one-line instructor explanation of the fault */
  explanation: string;
  /** one concrete drill to fix it */
  drill: string;
}

export const FAULTS: FaultDef[] = [
  {
    id: "stiff-legs",
    name: "Stiff legs / no knee flex",
    explanation:
      "Your legs barely bend through the turn, so the board can't absorb the terrain and every bump goes straight into your balance. Straight legs also lock your hips, which blocks rotation and edge pressure.",
    drill: "Traverse drill: on a mellow slope, traverse and slowly bounce — bend your knees to ~90° then extend — 5 times per traverse, keeping your chest up. Feel the board keep contact with the snow the whole time.",
  },
  {
    id: "back-seat",
    name: "Back-seat riding",
    explanation:
      "Your hips sit behind your back foot, unweighting the nose. The board becomes hard to steer, turns start skidding, and your back leg burns out. It usually comes from leaning away from the slope out of fear of speed.",
    drill: "Nose-touch drill: while traversing on a gentle run, reach your front hand down toward the nose of the board. You can't reach it without shifting weight forward. 5 reaches per traverse, both directions.",
  },
  {
    id: "counter-rotation",
    name: "Counter-rotation (upper body opens against the turn)",
    explanation:
      "Your shoulders rotate away from the direction of the turn while the board goes the other way. This stores twisted tension that releases unpredictably — that's the edge catch that comes out of nowhere.",
    drill: "Hands-on-lead-knee drill: ride easy turns with your front hand resting on your front knee. Your shoulders are forced to stay aligned with the board. Alternate with normal riding every 2 turns.",
  },
  {
    id: "waist-bend",
    name: "Bending at the waist instead of the knees",
    explanation:
      "You're folding at the hips to get low instead of flexing your knees and ankles. It looks low, but your weight is actually pitched forward and your legs are still straight — no absorption, no edge control.",
    drill: "Wall-sit drill: at home or in the lift line, sit into an invisible chair — back flat against a wall, knees at 90°, shins pressing forward into your boots. Hold 30 s. Recreate that shin pressure while riding.",
  },
  {
    id: "skidded-turn",
    name: "Skidded turn (no edge grip)",
    explanation:
      "The board slides sideways through the turn instead of slicing along its edge — you can hear the scraping. Usually caused by twisting the board with the back foot instead of tilting it onto edge.",
    drill: "Pencil-line drill: on a groomed blue, make slow turns trying to leave a single thin pencil line in the snow behind you instead of a wide washed-out track. Check your line after each traverse.",
  },
  {
    id: "late-edge-change",
    name: "Late edge change",
    explanation:
      "You hold the old edge too long into the fall line before changing edges, so each turn starts with a panic skid. The edge change should happen as the board points downhill, not after.",
    drill: "Countdown drill: say '3-2-1-change' out loud — initiate the new edge exactly when the nose crosses the fall line. Start on a green run and exaggerate the early commitment.",
  },
  {
    id: "rushed-initiation",
    name: "Rushed turn initiation",
    explanation:
      "You throw the board around at the start of the turn with a quick twist, skipping the patient pressure build-up. The turn starts skidded and you spend the rest of it recovering.",
    drill: "Slow-motion S: make turns at half your normal speed, taking 3 full seconds to roll from edge to edge. If you can't do it slowly, you can't do it fast with control.",
  },
  {
    id: "looking-down",
    name: "Looking down at the board",
    explanation:
      "Your head is dropped toward your feet. Your body follows your eyes, so looking down pulls your weight back and rounds your shoulders — and you can't see where you're going next.",
    drill: "Point-and-look drill: point your lead arm at where you want to be 2 seconds from now and keep your eyes on that point through the whole turn. Swap pointing arm with each turn direction.",
  },
  {
    id: "arm-flailing",
    name: "Arm flailing",
    explanation:
      "Your arms are windmilling to recover balance. It's a symptom, not the root cause — the balance problem is usually in the hips — but the flailing itself throws you further off.",
    drill: "Handcuff drill: ride a mellow run holding your hands together behind your back (or holding a poles-across-the-hips position). You'll be forced to balance from your feet and hips instead of your arms.",
  },
  {
    id: "uneven-rhythm",
    name: "Uneven turn rhythm",
    explanation:
      "Your turns are inconsistent in duration — long heelside, rushed toeside (or vice versa). One side is stronger, so you rush the uncomfortable side and skid it.",
    drill: "Metronome drill: pick a rhythm ('one-Mississippi-two' per turn) and force both heelside and toeside to fill the same count. Make symmetrical S-shaped tracks and check them from the lift.",
  },
  {
    id: "front-knee-not-driving",
    name: "Front knee not driving",
    explanation:
      "Your front knee stays passive instead of driving toward the turn. The front knee steers the board — when it's lazy, the board won't pivot and you compensate by twisting your shoulders.",
    drill: "Knee-to-corner drill: in a traverse, actively drive your front knee toward the nose corner of the board to start the turn. Exaggerate until you feel the board pivot under you.",
  },
  {
    id: "pop-timing",
    name: "Popping too early / too late (jumps)",
    explanation:
      "Your pop isn't timed with the lip. Popping early kills your height; popping late means the lip throws you off-axis. The pop should fire exactly as you reach the lip.",
    drill: "Flat-ground pop drill: ride straight on a flat cat track and practice the pop motion — even extension of both legs — 10 times. Then hit a small jump focusing only on waiting for the lip before extending.",
  },
  {
    id: "off-axis-rotation",
    name: "Rotation started off-axis (jumps)",
    explanation:
      "Your rotation starts with your shoulders tilted instead of level, so you cork or under/over-rotate in the air. Usually from dropping a shoulder or winding up unevenly at the lip.",
    drill: "Trampoline / flat 180 drill: practice the rotation on flat ground or a trampoline keeping both shoulders level — eyes on the horizon through takeoff. Level shoulders, then spin.",
  },
  {
    id: "stiff-landing",
    name: "Landing stiff (jumps)",
    explanation:
      "You land with straight legs, so the impact goes to your joints and there's no absorption to ride away clean. Landings need progressive knee flex to soak up the impact.",
    drill: "Drop-absorb drill: ride off small rollers and practice 'landing like a cat' — touch down quiet, knees absorbing over a full second. If you hear a slap, you landed stiff.",
  },
];

export const FAULT_IDS: string[] = FAULTS.map((f) => f.id);

export function faultById(id: string): FaultDef | undefined {
  return FAULTS.find((f) => f.id === id);
}
